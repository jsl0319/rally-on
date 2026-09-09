import { genderApplicationBlock, hasGenderQuota, remainingGenderSpots } from "@/matches/recruitment";
import { gameTypeLabels, type ActiveGameType } from "@/matches/game-type";
import { Prisma } from "@/generated/prisma/client";
import type { PlayPurpose, PrismaClient } from "@/generated/prisma/client";

import { getProfile, type ProfileWithRelations } from "@/server/domain/profile-service";
import { DomainError } from "@/server/domain/profile-service";
import { addAcceptedMemberToConversation, makeConversationReadOnly } from "@/server/domain/match-chat-service";
import { recordApplicationNotification } from "@/server/domain/notification-service";

import { isAwaitingRefund } from "./court-match";
import {
  getAcceptedCount,
  getApplicationStatusLabel,
  getEstimatedFeePerPerson,
  getPendingCount,
  getProfileLabels,
  getRecommendation,
  hasRemainingSpots,
  isDiscoverableMatch,
  matchStatusLabels,
  type MatchApplicationInput,
  type MatchApplicationDecisionInput,
  type MatchCancelInput,
  type MatchCreateInput,
  type MatchLifecycleInput,
  partnerPreferenceLabels,
  type RecommendationProfile,
} from "./match";

const matchInclude = {
  purposes: { select: { purpose: true } },
  host: {
    select: {
      id: true,
      nickname: true,
      tennisProfile: {
        include: {
          purposes: true,
        },
      },
    },
  },
  applications: { select: { id: true, applicantUserId: true, status: true, applicantGender: true } },
  conversation: { select: { status: true } },
  externalCourtImageUpload: { select: { id: true } },
  courtSlot: {
    include: {
      courtUnit: {
        include: {
          court: {
            include: {
              images: { where: { status: "ATTACHED", isRepresentative: true }, select: { id: true }, take: 1 },
              operatorApplication: { select: { status: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MatchInclude;

type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

type Viewer = {
  id: string;
  profile: ProfileWithRelations;
};

type MatchTransaction = Prisma.TransactionClient;

function toRecommendationProfile(profile: ProfileWithRelations): RecommendationProfile {
  return {
    rallyLevel: profile.rallyLevel,
    gameExperience: profile.gameExperience,
    playPurposes: profile.purposes.map(({ purpose }) => purpose),
  };
}

function toHostProfile(profile: MatchWithRelations["host"]["tennisProfile"]): RecommendationProfile | null {
  if (!profile) return null;
  return {
    rallyLevel: profile.rallyLevel,
    gameExperience: profile.gameExperience,
    playPurposes: profile.purposes.map(({ purpose }) => purpose),
  };
}

function toProfileView(profile: ProfileWithRelations | null) {
  if (!profile) return null;
  const { rallyLevelLabel, gameExperienceLabel } = getProfileLabels(profile);

  return {
    experienceRange: profile.experienceRange,
    experienceLabel: ({
      UNDER_3_MONTHS: "3개월 미만",
      MONTHS_3_TO_6: "3~6개월",
      MONTHS_6_TO_12: "6개월~1년",
      YEARS_1_TO_2: "1~2년",
      YEARS_2_PLUS: "2년 이상",
    } as const)[profile.experienceRange],
    rallyLevel: profile.rallyLevel,
    rallyLevelLabel,
    gameExperience: profile.gameExperience,
    gameExperienceLabel,
    playPurposes: profile.purposes.map(({ purpose }) => ({ code: purpose, label: ({
      CASUAL_HIT: "편하게 공 주고받기",
      RALLY_PRACTICE: "랠리",
      STROKE_PRACTICE: "스트로크 연습",
      GAME_INTRO: "게임 입문",
      GAME: "게임",
    } as const)[purpose] })),
  };
}

export function toProfileSnapshot(profile: ProfileWithRelations) {
  return {
    schemaVersion: 1,
    profileVersion: profile.version,
    gender: profile.gender ?? null,
    ...toProfileView(profile),
  };
}

function getRecommendationForMatch(match: MatchWithRelations, viewer: Viewer) {
  if (match.hostUserId === viewer.id) return { score: 0, reasons: [] };
  return getRecommendation(toRecommendationProfile(viewer.profile), toHostProfile(match.host.tennisProfile), {
    partnerPreference: match.partnerPreference,
    playPurposes: match.purposes.map(({ purpose }) => purpose),
  });
}

function getCourtView(match: Pick<MatchWithRelations, "id" | "courtSource" | "externalCourtName" | "externalCourtAddress" | "externalCourtNumber" | "externalCourtImageUpload" | "courtSlot">) {
  const image = match.externalCourtImageUpload
    ? { url: `/api/v1/matches/${match.id}/court-image`, sourceLabel: "모집자 제공 사진", fallback: "TENNIS_COURT_ILLUSTRATION" as const }
    : { url: null, sourceLabel: null, fallback: "TENNIS_COURT_ILLUSTRATION" as const };

  if (match.courtSource === "EXTERNAL_RESERVED") {
    return {
      source: match.courtSource,
      sourceLabel: "모집자가 코트를 예약했어요",
      participationNote: null,
      name: match.externalCourtName,
      address: match.externalCourtAddress,
      courtNumber: match.externalCourtNumber,
      usageNote: null,
      image,
    };
  }

  if (match.courtSource === "PARTNER_COURT") {
    const court = match.courtSlot?.courtUnit.court;
    const representativeImage = court?.status === "ACTIVE" && court.operatorApplication.status === "PUBLISH_APPROVED"
      ? court.images?.[0]
      : null;
    return {
      source: match.courtSource,
      sourceLabel: "Rally On에서 준비한 코트예요",
      participationNote: "참가 신청은 코트 매칭을 연 모집자에게 보내요.",
      name: court?.name ?? null,
      address: court?.address ?? null,
      // 운영자가 Slot에 적은 현장 이용 안내다. 참가 신청 전에 준비물·현장 규칙을 알 수 있어야 해서
      // 코트 매칭 상세에서도 그대로 보여 준다(화면 명세 §11의 CP02 정보 순서 5번).
      courtNumber: match.courtSlot?.courtUnit.name ?? null,
      usageNote: match.courtSlot?.usageNote ?? null,
      image: representativeImage && court
        ? { url: `/api/v1/partner-courts/${court.id}/image`, sourceLabel: "운영자 제공 사진", fallback: "TENNIS_COURT_ILLUSTRATION" as const }
        : { url: null, sourceLabel: null, fallback: "TENNIS_COURT_ILLUSTRATION" as const },
    };
  }

  return {
    source: match.courtSource,
    sourceLabel: "코트와 비용을 함께 정해요",
    participationNote: null,
    name: null,
    address: null,
    courtNumber: null,
    usageNote: null,
    image: { url: null, sourceLabel: null, fallback: "TENNIS_COURT_ILLUSTRATION" as const },
  };
}

async function reconcileStartedMatch(transaction: MatchTransaction, matchId: string, now = new Date()) {
  const match = await transaction.match.findUnique({
    where: { id: matchId },
    select: { id: true, status: true, courtSource: true, startsAt: true, applications: { select: { status: true } } },
  });
  if (!match || match.courtSource === "PARTNER_COURT" || match.status !== "OPEN" || match.startsAt > now) return match?.status ?? null;

  const hasAcceptedApplicant = match.applications.some((application) => application.status === "ACCEPTED");
  const nextStatus = hasAcceptedApplicant ? "CLOSED" : "EXPIRED";
  const updated = await transaction.match.updateMany({
    where: { id: match.id, status: "OPEN" },
    data: {
      status: nextStatus,
      ...(nextStatus === "CLOSED" ? { closedAt: now } : { expiredAt: now }),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) return null;

  await transaction.matchApplication.updateMany({
    where: { matchId: match.id, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  return nextStatus;
}

export async function reconcileStartedMatches(prisma: PrismaClient, now = new Date()) {
  const matches = await prisma.match.findMany({
    where: { courtSource: { not: "PARTNER_COURT" }, status: "OPEN", startsAt: { lte: now } },
    select: { id: true },
  });
  const statuses = await Promise.all(matches.map(({ id }) => prisma.$transaction((transaction) => reconcileStartedMatch(transaction, id, now))));

  return statuses.reduce(
    (summary, status) => {
      if (status === "CLOSED") summary.closed += 1;
      if (status === "EXPIRED") summary.expired += 1;
      return summary;
    },
    { checked: matches.length, closed: 0, expired: 0 },
  );
}

function toMatchCardView(match: MatchWithRelations, viewer: Viewer) {
  const acceptedCount = getAcceptedCount(match.applications);
  const recommendation = getRecommendationForMatch(match, viewer);

  return {
    id: match.id,
    title: match.title,
    recruitment: hasGenderQuota(match) ? { maleCount: match.maleRecruitCount, femaleCount: match.femaleRecruitCount, maleRemaining: remainingGenderSpots(match, match.applications, "MALE"), femaleRemaining: remainingGenderSpots(match, match.applications, "FEMALE") } : null,
    gameType: match.gameType ? { code: match.gameType, label: gameTypeLabels[match.gameType] } : null,
    status: match.status,
    statusLabel: matchStatusLabels[match.status],
    startsAt: match.startsAt.toISOString(),
    endsAt: match.endsAt.toISOString(),
    court: getCourtView(match),
    playPurposes: match.purposes.map(({ purpose }) => ({ code: purpose, label: ({
      CASUAL_HIT: "편하게 공 주고받기",
      RALLY_PRACTICE: "랠리",
      STROKE_PRACTICE: "스트로크 연습",
      GAME_INTRO: "게임 입문",
      GAME: "게임",
    } as const)[purpose] })),
    partnerPreference: match.partnerPreference,
    beginnerWelcome: match.partnerPreference === "COMPLETE_BEGINNER_WELCOME",
    recruitCount: match.recruitCount,
    acceptedCount,
    remainingSpots: Math.max(match.recruitCount - acceptedCount, 0),
    estimatedTotalParticipants: match.recruitCount + 1,
    estimatedFeePerPersonKrw: getEstimatedFeePerPerson(match.totalCourtFeeKrw),
    recommendationReasons: recommendation.reasons,
    isHost: match.hostUserId === viewer.id,
  };
}

type SupplyNotice = {
  code: "COURT_SUPPLY_WITHDRAWN";
  message: string;
  occurredAt: string;
  delivery: "IN_APP";
};

function toSupplyNoticeView(notice: { noticeCode: string; deliveredAt: Date; incident: { publicNoticeCode: string; withdrawnAt: Date | null } }): SupplyNotice | null {
  if (notice.noticeCode !== "COURT_SUPPLY_WITHDRAWN" || notice.incident.publicNoticeCode !== "COURT_SUPPLY_WITHDRAWN") return null;
  return {
    code: "COURT_SUPPLY_WITHDRAWN",
    message: "코트 운영 사정으로 이 코트 매칭이 취소됐어요.",
    occurredAt: (notice.incident.withdrawnAt ?? notice.deliveredAt).toISOString(),
    delivery: "IN_APP",
  };
}

function toCursor(match: MatchWithRelations) {
  return Buffer.from(JSON.stringify({ startsAt: match.startsAt.toISOString(), id: match.id })).toString("base64url");
}

export function parseCursor(cursor: string) {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object" || decoded === null ||
      typeof (decoded as { startsAt?: unknown }).startsAt !== "string" ||
      typeof (decoded as { id?: unknown }).id !== "string" ||
      Number.isNaN(new Date((decoded as { startsAt: string }).startsAt).getTime())
    ) throw new Error();
    return decoded as { startsAt: string; id: string };
  } catch {
    throw new DomainError("INVALID_REQUEST", 400, "목록을 다시 불러와 주세요.");
  }
}

export async function getOnboardedViewer(prisma: PrismaClient, user: { id: string; onboardingCompletedAt: Date | null }) {
  const profile = await getProfile(prisma, user.id);
  if (!user.onboardingCompletedAt || !profile) {
    throw new DomainError("ONBOARDING_REQUIRED", 403, "테니스 프로필을 먼저 완성해 주세요.");
  }
  return { id: user.id, profile } satisfies Viewer;
}

function filterDiscoverable(matches: MatchWithRelations[], now: Date) {
  return matches.filter((match) => match.courtSource === "EXTERNAL_RESERVED" && isDiscoverableMatch({
    status: match.status,
    startsAt: match.startsAt,
    recruitCount: match.recruitCount,
    applications: match.applications,
    now,
  }));
}

export async function getRecommendedMatches(prisma: PrismaClient, viewer: Viewer, limit: number) {
  const now = new Date();
  const matches = await prisma.match.findMany({
    where: { courtSource: "EXTERNAL_RESERVED", status: "OPEN", startsAt: { gt: now }, NOT: { hostUserId: viewer.id } },
    include: matchInclude,
  });

  return filterDiscoverable(matches, now)
    .filter((match) => !match.applications.some((application) => application.applicantUserId === viewer.id))
    .map((match) => ({ match, recommendation: getRecommendationForMatch(match, viewer) }))
    .sort((left, right) => right.recommendation.score - left.recommendation.score || left.match.startsAt.getTime() - right.match.startsAt.getTime() || left.match.id.localeCompare(right.match.id))
    .slice(0, limit)
    .map(({ match }) => toMatchCardView(match, viewer));
}

export type MatchSort = "recommended" | "soonest" | "newest";

// `input.date` is a "YYYY-MM-DD" calendar date picked from the discovery list's date
// filter, always meant in Korea Standard Time (the only timezone this product serves).
// This turns it into the UTC instant one KST day later, used as an exclusive upper bound
// on `startsAt` so the query still relies on the existing `startsFrom` lower bound (which
// already excludes matches that already started) rather than duplicating that logic here.
function getKstDateFilterEnd(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;

  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export async function getMatches(
  prisma: PrismaClient,
  viewer: Viewer,
  input: { gameType?: ActiveGameType; playPurpose?: PlayPurpose; startsFrom: Date; cursor?: { startsAt: string; id: string }; limit: number; sort?: MatchSort; date?: string },
) {
  const sort = input.sort ?? "recommended";
  const dateFilterEnd = input.date ? getKstDateFilterEnd(input.date) : null;
  const baseWhere = {
    status: "OPEN",
    startsAt: { gt: input.startsFrom, ...(dateFilterEnd ? { lt: dateFilterEnd } : {}) },
    courtSource: "EXTERNAL_RESERVED",
    NOT: [
      { applications: { some: { applicantUserId: viewer.id } } },
    ],
    ...(input.gameType ? { gameType: input.gameType } : {}),
    ...(input.playPurpose ? { purposes: { some: { purpose: input.playPurpose } } } : {}),
  } satisfies Prisma.MatchWhereInput;

  if (sort === "soonest") {
    const cursorCondition = input.cursor
      ? {
          OR: [
            { startsAt: { gt: new Date(input.cursor.startsAt) } },
            { startsAt: new Date(input.cursor.startsAt), id: { gt: input.cursor.id } },
          ],
        }
      : undefined;
    const matches = await prisma.match.findMany({
      where: { ...baseWhere, ...cursorCondition },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      include: matchInclude,
    });
    const items = filterDiscoverable(matches, new Date()).slice(0, input.limit + 1);
    const hasNext = items.length > input.limit;
    const visibleItems = hasNext ? items.slice(0, input.limit) : items;

    return {
      items: visibleItems.map((match) => toMatchCardView(match, viewer)),
      pageInfo: {
        nextCursor: hasNext && visibleItems.at(-1) ? toCursor(visibleItems.at(-1)!) : null,
        hasNext,
      },
    };
  }

  // "recommended" and "newest" rank by something other than startsAt, so the startsAt/id
  // keyset cursor above doesn't apply to them. The home screen only ever loads a single
  // page today, so we fetch a bounded candidate set and rank it in memory instead.
  const candidates = await prisma.match.findMany({
    where: baseWhere,
    orderBy: sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : [{ startsAt: "asc" }, { id: "asc" }],
    include: matchInclude,
    take: 200,
  });
  const discoverable = filterDiscoverable(candidates, new Date());
  const ordered = sort === "recommended"
    ? [...discoverable].sort((left, right) => (
        getRecommendationForMatch(right, viewer).score - getRecommendationForMatch(left, viewer).score
        || left.startsAt.getTime() - right.startsAt.getTime()
        || left.id.localeCompare(right.id)
      ))
    : discoverable;
  const visibleItems = ordered.slice(0, input.limit);

  return {
    items: visibleItems.map((match) => toMatchCardView(match, viewer)),
    pageInfo: { nextCursor: null, hasNext: ordered.length > input.limit },
  };
}

export async function getMatchDetail(prisma: PrismaClient, viewer: Viewer, matchId: string) {
  await prisma.$transaction((transaction) => reconcileStartedMatch(transaction, matchId));
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: matchInclude });
  if (!match) throw new DomainError("MATCH_NOT_FOUND", 404, "매칭을 찾을 수 없어요.");

  const application = match.applications.find((item) => item.applicantUserId === viewer.id) ?? null;
  const relation = match.hostUserId === viewer.id ? "HOST" : application ? "APPLICANT" : "NONE";
  if ((match.status !== "OPEN" || match.courtSource === "COURT_TBD") && relation === "NONE") {
    throw new DomainError("MATCH_NOT_FOUND", 404, "매칭을 찾을 수 없어요.");
  }

  const now = new Date();
  const acceptedCount = getAcceptedCount(match.applications);
  const genderBlock = genderApplicationBlock(match, match.applications, viewer.profile.gender);
  const canApply = !genderBlock && relation === "NONE" && match.status === "OPEN" && match.startsAt > now && hasRemainingSpots(match.recruitCount, match.applications);
  const applyBlockedReason = canApply
    ? null
    : relation === "HOST"
      ? "OWN_MATCH"
      : relation === "APPLICANT"
        ? "ALREADY_APPLIED"
        : genderBlock
          ? genderBlock
          : match.status !== "OPEN"
          ? "MATCH_NOT_OPEN"
          : match.startsAt <= now
            ? "MATCH_STARTED"
            : "NO_REMAINING_SPOTS";
  const card = toMatchCardView(match, viewer);
  const recommendationReasons = relation === "HOST" ? [] : card.recommendationReasons;
  const canSeeContact = relation === "HOST" || application?.status === "ACCEPTED";
  const notice = relation === "NONE"
    ? null
    : await prisma.matchSupplyNoticeRecipient.findFirst({
        where: { matchId: match.id, recipientUserId: viewer.id },
        include: { incident: { select: { publicNoticeCode: true, withdrawnAt: true } } },
        orderBy: { deliveredAt: "desc" },
      });

  return {
    ...card,
    recommendationReasons,
    court: {
      ...card.court,
    },
    totalCourtFeeKrw: match.totalCourtFeeKrw,
    additionalCostNote: match.additionalCostNote,
    introduction: match.introduction,
    settlementAccount: canSeeContact && match.settlementBank && match.settlementAccountNumber && match.settlementAccountHolder
      ? { bank: match.settlementBank, accountNumber: match.settlementAccountNumber, accountHolder: match.settlementAccountHolder }
      : null,
    partnerPreferenceLabel: partnerPreferenceLabels[match.partnerPreference],
    host: { nickname: match.host.nickname, tennisProfile: toProfileView(match.host.tennisProfile) },
    viewer: {
      relation,
      canApply,
      applyBlockedReason,
      applicationId: application?.id ?? null,
      applicationStatus: application?.status ?? null,
      tennisProfile: toProfileView(viewer.profile),
      canComplete: relation === "HOST" && match.status === "CLOSED" && match.endsAt <= now,
    },
    contact: canSeeContact
      ? { conversationStatus: match.conversation?.status ?? "NOT_CREATED", href: match.conversation ? `/chats/${match.id}` : null, label: "채팅방 열기" }
      : null,
    supplyNotice: notice ? toSupplyNoticeView(notice) : null,
    version: match.version,
    createdAt: match.createdAt.toISOString(),
    acceptedCount,
  };
}

function optionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function isSameCreateRequest(match: MatchWithRelations, input: MatchCreateInput) {
  const sameCommonInput = (input.title === undefined || match.title === input.title) &&
    (match.gameType ?? null) === (input.gameType ?? null) &&
    (match.settlementBank ?? null) === optionalText(input.settlementAccount?.bank) &&
    (match.settlementAccountNumber ?? null) === optionalText(input.settlementAccount?.accountNumber) &&
    (match.settlementAccountHolder ?? null) === optionalText(input.settlementAccount?.accountHolder) &&
    match.courtSource === input.courtSource &&
    (match.maleRecruitCount ?? null) === (input.maleRecruitCount ?? null) &&
    (match.femaleRecruitCount ?? null) === (input.femaleRecruitCount ?? null) &&
    match.recruitCount === input.recruitCount &&
    match.partnerPreference === input.partnerPreference &&
    match.introduction === optionalText(input.introduction) &&
    match.purposes.map(({ purpose }) => purpose).sort().join(",") === [...input.playPurposes].sort().join(",");

  if (!sameCommonInput) return false;
  if (input.courtSource === "PARTNER_COURT") return match.courtSlotId === input.courtSlotId;

  return match.startsAt.getTime() === new Date(input.startsAt).getTime() &&
    match.endsAt.getTime() === new Date(input.endsAt).getTime() &&
    match.externalCourtName === input.externalCourt.name &&
    match.externalCourtAddress === input.externalCourt.address &&
    match.externalCourtNumber === optionalText(input.externalCourt.courtNumber) &&
    match.externalCourtImageUploadId === (input.externalCourt.imageUploadId ?? null) &&
    match.totalCourtFeeKrw === input.totalCourtFeeKrw &&
    match.additionalCostNote === optionalText(input.additionalCostNote);
}

async function findExistingCreateRequest(prisma: PrismaClient, viewer: Viewer, input: MatchCreateInput) {
  const existing = await prisma.match.findUnique({
    where: { hostUserId_clientRequestId: { hostUserId: viewer.id, clientRequestId: input.clientRequestId } },
    include: matchInclude,
  });
  if (!existing) return null;
  if (!isSameCreateRequest(existing, input)) {
    throw new DomainError("IDEMPOTENCY_KEY_REUSED", 409, "같은 요청 식별자로 다른 매칭을 만들 수 없어요.");
  }
  return existing;
}

export async function createMatch(prisma: PrismaClient, viewer: Viewer, input: MatchCreateInput) {
  const existing = await findExistingCreateRequest(prisma, viewer, input);
  if (existing) {
    return { match: await getMatchDetail(prisma, viewer, existing.id), created: false };
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      if (input.courtSource === "PARTNER_COURT") {
        throw new DomainError("COURT_MATCH_OPERATOR_ONLY", 409, "코트 매칭은 운영자가 공개해요. 코트 매칭 목록에서 참가해 주세요.");
      }

      const imageUploadId = input.externalCourt.imageUploadId ?? null;
      if (imageUploadId) {
        const imageClaimed = await transaction.courtImageUpload.updateMany({
          where: { id: imageUploadId, ownerUserId: viewer.id, status: "PENDING" },
          data: { status: "ATTACHED", attachedAt: new Date() },
        });
        if (imageClaimed.count !== 1) {
          throw new DomainError("COURT_IMAGE_UPLOAD_UNAVAILABLE", 409, "이 코트 사진은 사용할 수 없어요. 사진을 다시 올려 주세요.");
        }
      }

      return transaction.match.create({
        data: {
          hostUserId: viewer.id, clientRequestId: input.clientRequestId, title: input.title ?? input.externalCourt.name.slice(0, 80),
          startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), courtSource: "EXTERNAL_RESERVED",
          externalCourtName: input.externalCourt.name,
          externalCourtAddress: input.externalCourt.address,
          externalCourtNumber: optionalText(input.externalCourt.courtNumber),
          externalCourtImageUploadId: imageUploadId, courtSlotId: null, recruitCount: input.recruitCount,
          partnerPreference: input.partnerPreference, totalCourtFeeKrw: input.totalCourtFeeKrw,
          additionalCostNote: optionalText(input.additionalCostNote), introduction: optionalText(input.introduction),
          maleRecruitCount: input.maleRecruitCount ?? null,
          femaleRecruitCount: input.femaleRecruitCount ?? null,
          gameType: input.gameType ?? null,
          settlementBank: optionalText(input.settlementAccount?.bank),
          settlementAccountNumber: optionalText(input.settlementAccount?.accountNumber),
          settlementAccountHolder: optionalText(input.settlementAccount?.accountHolder),
          purposes: { create: input.playPurposes.map((purpose) => ({ purpose })) },
        },
        select: { id: true },
      });
    });
    return { match: await getMatchDetail(prisma, viewer, created.id), created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrentMatch = await findExistingCreateRequest(prisma, viewer, input);
      if (concurrentMatch) {
        return { match: await getMatchDetail(prisma, viewer, concurrentMatch.id), created: false };
      }
    }
    throw error;
  }
}

const applicationInclude = {
  applicantUser: { select: { nickname: true } },
  match: {
    include: {
      courtSlot: { include: { courtUnit: { include: { court: true } } } },
      conversation: { select: { status: true } },
    },
  },
} satisfies Prisma.MatchApplicationInclude;

type ApplicationWithRelations = Prisma.MatchApplicationGetPayload<{ include: typeof applicationInclude }>;

function toApplicationView(application: ApplicationWithRelations, supplyNotice: SupplyNotice | null = null) {
  return {
    id: application.id,
    status: application.status,
    statusLabel: getApplicationStatusLabel(application.status, application.match.status),
    message: application.message,
    applicantGender: application.applicantGender ?? null,
    applicant: {
      nickname: application.applicantUser.nickname,
      profileSnapshot: application.profileSnapshot,
    },
    match: {
      id: application.match.id,
      title: application.match.title,
      status: application.match.status,
      statusLabel: matchStatusLabels[application.match.status],
      startsAt: application.match.startsAt.toISOString(),
      endsAt: application.match.endsAt.toISOString(),
      courtSource: application.match.courtSource,
      courtName: application.match.courtSource === "PARTNER_COURT"
        ? application.match.courtSlot?.courtUnit.court.name ?? null
        : application.match.externalCourtName,
      estimatedFeePerPersonKrw: getEstimatedFeePerPerson(application.match.totalCourtFeeKrw),
      // 코트 매칭은 상세가 전용 주소에 있다. 활동 화면이 곧장 그쪽으로 보낼 수 있게 한다.
      courtSlotId: application.match.courtSlotId,
    },
    // 코트 매칭은 승인만으로 끝나지 않는다. 지금 무엇을 해야 하는지 활동 화면에서
    // 바로 알 수 있도록 계좌이체 흐름의 상태를 함께 준다(docs/03-2 §3.1, §3.9).
    courtMatch: application.match.courtSource === "PARTNER_COURT"
      ? {
          depositCode: application.depositCode,
          paymentDueAt: application.paymentDueAt?.toISOString() ?? null,
          depositClaimedAt: application.depositClaimedAt?.toISOString() ?? null,
          confirmedAt: application.confirmedAt?.toISOString() ?? null,
          awaitingRefund: isAwaitingRefund(application),
          refundRequested: application.refundRequestedAt !== null,
          refundCompletedAt: application.refundCompletedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: application.createdAt.toISOString(),
    decidedAt: application.decidedAt?.toISOString() ?? null,
    withdrawnAt: application.withdrawnAt?.toISOString() ?? null,
    cancelledAt: application.cancelledAt?.toISOString() ?? null,
    contact: application.status === "ACCEPTED" || application.status === "CONFIRMED"
      ? { conversationStatus: application.match.conversation?.status ?? "NOT_CREATED", href: application.match.conversation ? `/chats/${application.match.id}` : null, label: "채팅방 열기" }
      : null,
    supplyNotice,
  };
}

export async function createApplication(prisma: PrismaClient, viewer: Viewer, matchId: string, input: MatchApplicationInput) {
  try {
    const application = await prisma.$transaction(async (transaction) => {
      await reconcileStartedMatch(transaction, matchId);
      const match = await transaction.match.findUnique({
        where: { id: matchId },
        select: {
          hostUserId: true,
          title: true,
          courtSource: true,
          status: true,
          startsAt: true,
          recruitCount: true,
          maleRecruitCount: true,
          femaleRecruitCount: true,
          applications: { select: { status: true, applicantUserId: true, applicantGender: true } },
        },
      });

      if (!match) throw new DomainError("MATCH_NOT_FOUND", 404, "매칭을 찾을 수 없어요.");
      if (match.hostUserId === viewer.id) throw new DomainError("OWN_MATCH_APPLICATION_NOT_ALLOWED", 409, "내가 만든 매칭에는 신청할 수 없어요.");
      if (match.courtSource === "COURT_TBD") throw new DomainError("LEGACY_MATCH_NOT_JOINABLE", 409, "코트 미정 매칭은 새 신청을 받지 않아요.");
      // 코트 매칭은 승인·입금·확정 규칙이 달라 전용 흐름(court-match-service)이 처리한다.
      if (match.courtSource === "PARTNER_COURT") throw new DomainError("COURT_MATCH_APPLICATION_PATH", 409, "코트 매칭은 코트 매칭 화면에서 신청해 주세요.");
      if (match.status === "CANCELLED") throw new DomainError("MATCH_CANCELLED", 409, "취소된 매칭에는 신청할 수 없어요.");
      if (match.status !== "OPEN") throw new DomainError("MATCH_ALREADY_CLOSED", 409, "모집이 마감된 매칭이에요.");
      if (match.startsAt <= new Date()) throw new DomainError("MATCH_ALREADY_ENDED", 409, "이미 시작된 일정에는 신청할 수 없어요.");
      if (match.applications.some((item) => item.applicantUserId === viewer.id)) throw new DomainError("APPLICATION_ALREADY_EXISTS", 409, "이미 신청한 매칭이에요.");
      if (!hasRemainingSpots(match.recruitCount, match.applications)) throw new DomainError("NO_REMAINING_SPOTS", 409, "남은 자리가 없어요.");

      const genderBlock = genderApplicationBlock(match, match.applications, viewer.profile.gender);
      if (genderBlock) throw new DomainError(genderBlock, 409, genderBlock === "PROFILE_GENDER_REQUIRED" ? "프로필에서 성별을 입력한 뒤 신청해 주세요." : "해당 성별의 모집 인원이 모두 찼어요.");

      const created = await transaction.matchApplication.create({
        data: {
          matchId,
          applicantUserId: viewer.id,
          applicantGender: hasGenderQuota(match) ? viewer.profile.gender : null,
          message: optionalText(input.message),
          profileSnapshot: toProfileSnapshot(viewer.profile),
          profileSnapshotVersion: 1,
        },
        include: applicationInclude,
      });
      await recordApplicationNotification(transaction, {
        recipientUserId: match.hostUserId,
        type: "APPLICATION_RECEIVED",
        matchTitle: match.title,
        href: `/activity/received/${matchId}`,
      });
      return created;
    });
    return toApplicationView(application);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("APPLICATION_ALREADY_EXISTS", 409, "이미 신청한 매칭이에요.");
    }
    throw error;
  }
}

export async function getSentApplications(prisma: PrismaClient, viewer: Viewer) {
  await reconcileStartedMatches(prisma);
  const applications = await prisma.matchApplication.findMany({
    where: { applicantUserId: viewer.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: applicationInclude,
  });
  const notices = applications.length === 0
    ? []
    : await prisma.matchSupplyNoticeRecipient.findMany({
        where: { recipientUserId: viewer.id, matchId: { in: applications.map((application) => application.matchId) } },
        include: { incident: { select: { publicNoticeCode: true, withdrawnAt: true } } },
        orderBy: { deliveredAt: "desc" },
      });
  const noticesByMatchId = new Map<string, SupplyNotice>();
  for (const notice of notices) {
    const view = toSupplyNoticeView(notice);
    if (view && !noticesByMatchId.has(notice.matchId)) noticesByMatchId.set(notice.matchId, view);
  }
  return { items: applications.map((application) => toApplicationView(application, noticesByMatchId.get(application.matchId) ?? null)) };
}

export async function getReceivedApplications(prisma: PrismaClient, viewer: Viewer, matchId: string, statuses: Array<"PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CANCELLED"> = ["PENDING"]) {
  await prisma.$transaction((transaction) => reconcileStartedMatch(transaction, matchId));
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: matchInclude });
  if (!match || match.hostUserId !== viewer.id) throw new DomainError("MATCH_NOT_FOUND", 404, "매칭을 찾을 수 없어요.");

  const applications = await prisma.matchApplication.findMany({
    where: { matchId, ...(statuses.length > 0 ? { status: { in: statuses } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: applicationInclude,
  });
  const acceptedCount = getAcceptedCount(match.applications);

  return {
    match: {
      id: match.id,
      title: match.title,
      status: match.status,
      statusLabel: matchStatusLabels[match.status],
      startsAt: match.startsAt.toISOString(),
      endsAt: match.endsAt.toISOString(),
      court: getCourtView(match),
      recruitCount: match.recruitCount,
      acceptedCount,
      pendingApplicationCount: getPendingCount(match.applications),
      remainingSpots: Math.max(match.recruitCount - acceptedCount, 0),
      version: match.version,
    },
    items: applications.map((application) => toApplicationView(application)),
  };
}

export async function acceptApplication(prisma: PrismaClient, viewer: Viewer, applicationId: string, input: MatchApplicationDecisionInput) {
  return prisma.$transaction(async (transaction) => {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      include: { match: { select: { id: true, hostUserId: true, title: true, status: true, startsAt: true, recruitCount: true, maleRecruitCount: true, femaleRecruitCount: true, version: true } } },
    });
    if (!application || application.match.hostUserId !== viewer.id) throw new DomainError("MATCH_HOST_REQUIRED", 403, "이 매칭의 모집자만 신청을 검토할 수 있어요.");
    await reconcileStartedMatch(transaction, application.match.id);
    const refreshedMatch = await transaction.match.findUnique({ where: { id: application.match.id }, select: { status: true, startsAt: true, version: true } });
    if (!refreshedMatch) throw new DomainError("MATCH_NOT_FOUND", 404, "매칭을 찾을 수 없어요.");
    if (application.status !== "PENDING") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "이미 처리된 신청이에요.");
    if (refreshedMatch.status !== "OPEN" || refreshedMatch.startsAt <= new Date()) throw new DomainError("MATCH_STATE_CONFLICT", 409, "현재 모집 중인 매칭에서만 신청을 수락할 수 있어요.");
    if (refreshedMatch.version !== input.expectedMatchVersion) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 신청 목록을 다시 불러와 주세요.");

    const reservedMatch = await transaction.match.updateMany({
      where: { id: application.match.id, status: "OPEN", version: input.expectedMatchVersion },
      data: { version: { increment: 1 } },
    });
    if (reservedMatch.count !== 1) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 신청 목록을 다시 불러와 주세요.");

    const acceptedCount = await transaction.matchApplication.count({ where: { matchId: application.match.id, status: "ACCEPTED" } });
    if (acceptedCount >= application.match.recruitCount) throw new DomainError("NO_REMAINING_SPOTS", 409, "남은 자리가 없어 신청을 수락할 수 없어요.");

    if (hasGenderQuota(application.match)) {
      if (!application.applicantGender) throw new DomainError("PROFILE_GENDER_REQUIRED", 409, "신청 당시 성별 정보가 없어 수락할 수 없어요.");
      const genderCount = await transaction.matchApplication.count({ where: { matchId: application.match.id, status: "ACCEPTED", applicantGender: application.applicantGender } });
      const quota = application.applicantGender === "MALE" ? application.match.maleRecruitCount : application.match.femaleRecruitCount;
      if (genderCount >= (quota ?? 0)) throw new DomainError("GENDER_QUOTA_FULL", 409, "해당 성별의 모집 인원이 모두 차서 수락할 수 없어요.");
    }
    const decidedAt = new Date();
    const accepted = await transaction.matchApplication.updateMany({
      where: { id: application.id, status: "PENDING" },
      data: { status: "ACCEPTED", decidedAt },
    });
    if (accepted.count !== 1) throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "이미 처리된 신청이에요.");

    await recordApplicationNotification(transaction, {
      recipientUserId: application.applicantUserId,
      type: "APPLICATION_ACCEPTED",
      matchTitle: application.match.title,
      href: "/activity/sent",
    });

    await addAcceptedMemberToConversation(transaction, {
      matchId: application.match.id,
      hostUserId: application.match.hostUserId,
      applicantUserId: application.applicantUserId,
      now: decidedAt,
    });

    const nextAcceptedCount = acceptedCount + 1;
    const isFull = nextAcceptedCount >= application.match.recruitCount;
    if (isFull) {
      await transaction.match.update({ where: { id: application.match.id }, data: { status: "CLOSED", closedAt: decidedAt } });
      await transaction.matchApplication.updateMany({
        where: { matchId: application.match.id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: decidedAt },
      });
    }

    return {
      application: { id: application.id, status: "ACCEPTED" as const, decidedAt: decidedAt.toISOString() },
      match: {
        id: application.match.id,
        status: isFull ? "CLOSED" as const : "OPEN" as const,
        acceptedCount: nextAcceptedCount,
        remainingSpots: Math.max(application.match.recruitCount - nextAcceptedCount, 0),
        version: input.expectedMatchVersion + 1,
      },
    };
  });
}

export async function rejectApplication(prisma: PrismaClient, viewer: Viewer, applicationId: string) {
  return prisma.$transaction(async (transaction) => {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      include: { match: { select: { id: true, hostUserId: true, title: true } } },
    });
    if (!application || application.match.hostUserId !== viewer.id) throw new DomainError("MATCH_HOST_REQUIRED", 403, "이 매칭의 모집자만 신청을 검토할 수 있어요.");
    await reconcileStartedMatch(transaction, application.match.id);
    const refreshedMatch = await transaction.match.findUnique({ where: { id: application.match.id }, select: { status: true, startsAt: true } });
    if (!refreshedMatch) throw new DomainError("MATCH_NOT_FOUND", 404, "매칭을 찾을 수 없어요.");
    if (application.status !== "PENDING") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "이미 처리된 신청이에요.");
    if (refreshedMatch.status !== "OPEN" || refreshedMatch.startsAt <= new Date()) {
      throw new DomainError("MATCH_STATE_CONFLICT", 409, "현재 모집 중인 매칭에서만 신청을 거절할 수 있어요.");
    }
    const rejected = await transaction.matchApplication.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    if (rejected.count !== 1) throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "이미 처리된 신청이에요.");
    await recordApplicationNotification(transaction, {
      recipientUserId: application.applicantUserId,
      type: "APPLICATION_REJECTED",
      matchTitle: application.match.title,
      href: "/activity/sent",
    });
    const result = await transaction.matchApplication.findUnique({ where: { id: applicationId }, include: applicationInclude });
    if (!result) throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "신청 상태를 다시 확인해 주세요.");
    return toApplicationView(result);
  });
}

export async function withdrawApplication(prisma: PrismaClient, viewer: Viewer, applicationId: string) {
  return prisma.$transaction(async (transaction) => {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, applicantUserId: true, matchId: true },
    });
    if (!application || application.applicantUserId !== viewer.id) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청 내역을 찾을 수 없어요.");
    await reconcileStartedMatch(transaction, application.matchId);
    const withdrawnAt = new Date();
    const updated = await transaction.matchApplication.updateMany({
      where: { id: application.id, status: "PENDING" },
      data: { status: "WITHDRAWN", withdrawnAt },
    });
    if (updated.count !== 1) throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "검토 중인 신청만 철회할 수 있어요.");
    const result = await transaction.matchApplication.findUnique({ where: { id: application.id }, include: applicationInclude });
    if (!result) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청 내역을 찾을 수 없어요.");
    return toApplicationView(result);
  });
}

export async function cancelMatch(prisma: PrismaClient, viewer: Viewer, matchId: string, input: MatchCancelInput) {
  return prisma.$transaction(async (transaction) => {
    await reconcileStartedMatch(transaction, matchId);
    const match = await transaction.match.findUnique({
      where: { id: matchId },
      select: { id: true, hostUserId: true, status: true, startsAt: true, version: true, courtSource: true },
    });
    if (!match || match.hostUserId !== viewer.id) throw new DomainError("MATCH_HOST_REQUIRED", 403, "이 매칭의 모집자만 취소할 수 있어요.");
    if (match.version !== input.expectedVersion) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 매칭 정보를 다시 불러와 주세요.");
    if ((match.status !== "OPEN" && match.status !== "CLOSED") || match.startsAt <= new Date()) {
      throw new DomainError("MATCH_STATE_CONFLICT", 409, "시작 전 모집 중이거나 마감된 매칭만 취소할 수 있어요.");
    }
    const cancelledAt = new Date();
    const updated = await transaction.match.updateMany({
      where: { id: match.id, version: input.expectedVersion, status: { in: ["OPEN", "CLOSED"] } },
      data: { status: "CANCELLED", cancelledAt, cancellationReason: optionalText(input.reason), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 매칭 정보를 다시 불러와 주세요.");
    await transaction.matchApplication.updateMany({
      where: { matchId: match.id, status: { in: ["PENDING", "ACCEPTED"] } },
      data: { status: "CANCELLED", cancelledAt },
    });
    await makeConversationReadOnly(transaction, match.id, "매칭이 취소되어 이 채팅방은 읽기 전용이에요.", cancelledAt);
    return {
      id: match.id,
      status: "CANCELLED" as const,
      cancelledAt: cancelledAt.toISOString(),
      notice: match.courtSource === "EXTERNAL_RESERVED"
        ? "외부에서 예약한 코트는 별도로 취소해야 해요."
        : "수락된 참가자에게 취소 상태를 알려드렸어요.",
      version: input.expectedVersion + 1,
    };
  });
}

export async function closeMatch(prisma: PrismaClient, viewer: Viewer, matchId: string, input: MatchLifecycleInput) {
  return prisma.$transaction(async (transaction) => {
    await reconcileStartedMatch(transaction, matchId);
    const match = await transaction.match.findUnique({
      where: { id: matchId },
      select: { id: true, hostUserId: true, status: true, startsAt: true, version: true },
    });
    if (!match || match.hostUserId !== viewer.id) throw new DomainError("MATCH_HOST_REQUIRED", 403, "이 매칭의 모집자만 모집을 마감할 수 있어요.");
    if (match.version !== input.expectedVersion) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 매칭 정보를 다시 불러와 주세요.");
    if (match.status !== "OPEN" || match.startsAt <= new Date()) throw new DomainError("MATCH_STATE_CONFLICT", 409, "시작 전 모집 중인 매칭만 마감할 수 있어요.");
    const acceptedCount = await transaction.matchApplication.count({ where: { matchId: match.id, status: "ACCEPTED" } });
    if (acceptedCount < 1) throw new DomainError("MATCH_CANNOT_CLOSE", 409, "한 명 이상 수락한 뒤 모집을 마감할 수 있어요.");
    const closedAt = new Date();
    const updated = await transaction.match.updateMany({
      where: { id: match.id, status: "OPEN", version: input.expectedVersion },
      data: { status: "CLOSED", closedAt, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 매칭 정보를 다시 불러와 주세요.");
    await transaction.matchApplication.updateMany({
      where: { matchId: match.id, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: closedAt },
    });
    return { id: match.id, status: "CLOSED" as const, closedAt: closedAt.toISOString(), version: input.expectedVersion + 1 };
  });
}

export async function completeMatch(prisma: PrismaClient, viewer: Viewer, matchId: string, input: MatchLifecycleInput) {
  return prisma.$transaction(async (transaction) => {
    await reconcileStartedMatch(transaction, matchId);
    const match = await transaction.match.findUnique({
      where: { id: matchId },
      select: { id: true, hostUserId: true, status: true, endsAt: true, version: true },
    });
    if (!match || match.hostUserId !== viewer.id) throw new DomainError("MATCH_HOST_REQUIRED", 403, "이 매칭의 모집자만 완료 처리할 수 있어요.");
    if (match.version !== input.expectedVersion) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 매칭 정보를 다시 불러와 주세요.");
    if (match.status !== "CLOSED" || match.endsAt > new Date()) throw new DomainError("MATCH_NOT_COMPLETABLE", 409, "일정이 끝난 모집 마감 매칭만 완료할 수 있어요.");
    const completedAt = new Date();
    const updated = await transaction.match.updateMany({
      where: { id: match.id, status: "CLOSED", version: input.expectedVersion },
      data: { status: "COMPLETED", completedAt, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new DomainError("VERSION_CONFLICT", 409, "다른 변경사항이 있어 매칭 정보를 다시 불러와 주세요.");
    return { id: match.id, status: "COMPLETED" as const, completedAt: completedAt.toISOString(), version: input.expectedVersion + 1 };
  });
}

export async function getHostedMatches(prisma: PrismaClient, viewer: Viewer) {
  await reconcileStartedMatches(prisma);
  const now = new Date();
  const matches = await prisma.match.findMany({
    where: { hostUserId: viewer.id }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], include: matchInclude,
  });
  return matches
    .map((match) => {
      const acceptedCount = getAcceptedCount(match.applications);
      const pendingApplicationCount = getPendingCount(match.applications);
      const isFuture = match.startsAt > now;
      return {
        match,
        card: toMatchCardView(match, viewer),
        pendingApplicationCount,
        canClose: match.status === "OPEN" && isFuture && acceptedCount > 0,
        canCancel: (match.status === "OPEN" || match.status === "CLOSED") && isFuture,
        canComplete: match.status === "CLOSED" && match.endsAt <= now,
      };
    })
    .sort((left, right) => {
      const group = (item: { match: MatchWithRelations; pendingApplicationCount: number }) => item.match.startsAt <= now ? 2 : item.pendingApplicationCount > 0 ? 0 : 1;
      return group(left) - group(right) || left.match.startsAt.getTime() - right.match.startsAt.getTime();
    })
    .map(({ match, card, pendingApplicationCount, canClose, canCancel, canComplete }) => ({
      ...card,
      contact: { conversationStatus: match.conversation?.status ?? "NOT_CREATED", href: match.conversation ? `/chats/${match.id}` : null, label: "채팅방 열기" },
      pendingApplicationCount,
      canClose,
      canCancel,
      canComplete,
    }));
}
