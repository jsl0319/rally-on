import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "./profile-service";
import { reconcileCourtMatch } from "./court-match-service";
import { getApplicationDeadline, getJudgementAt, isAwaitingRefund, seatHoldingStatuses } from "./court-match";

const applicationSelect = {
  id: true, applicantUserId: true, applicantGender: true, status: true, createdAt: true,
  message: true, profileSnapshot: true, paymentDueAt: true, depositCode: true,
  depositorName: true, depositClaimedAt: true, confirmedAt: true,
  refundBank: true, refundAccountNumber: true, refundAccountHolder: true,
  refundRequestedAt: true, refundCompletedAt: true,
  applicantUser: { select: { nickname: true } },
} satisfies Prisma.MatchApplicationSelect;

const matchInclude = {
  applications: { select: applicationSelect, orderBy: { createdAt: "asc" } },
  conversation: { select: { status: true } },
  courtSlot: { include: { courtUnit: { include: { court: { include: { operatorApplication: { select: { applicantUserId: true } } } } } } } },
} satisfies Prisma.MatchInclude;

type Application = Prisma.MatchApplicationGetPayload<{ select: typeof applicationSelect }>;
type Match = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

export function courtApplicationStatusLabel(application: Pick<Application, "status" | "depositClaimedAt" | "confirmedAt" | "refundCompletedAt">) {
  if (application.status === "CANCELLED" && application.confirmedAt) return application.refundCompletedAt ? "환불 완료 표시" : "환불 대기";
  if (application.status === "ACCEPTED" && application.depositClaimedAt) return "입금 확인 중";
  return ({ PENDING: "승인 대기", ACCEPTED: "입금 대기", CONFIRMED: "참가 확정", REJECTED: "신청 거절", WITHDRAWN: "신청 철회", EXPIRED_UNPAID: "입금 기한 만료", CANCELLED: "취소됨" } as const)[application.status];
}

function toApplication(application: Application) {
  return {
    id: application.id, nickname: application.applicantUser.nickname, gender: application.applicantGender,
    status: application.status, statusLabel: courtApplicationStatusLabel(application),
    createdAt: application.createdAt.toISOString(), depositCode: application.depositCode,
    paymentDueAt: application.paymentDueAt?.toISOString() ?? null,
    depositorName: application.depositorName, depositClaimedAt: application.depositClaimedAt?.toISOString() ?? null,
    confirmedAt: application.confirmedAt?.toISOString() ?? null,
    awaitingRefund: isAwaitingRefund(application),
    refundAccount: application.status === "CANCELLED" && application.confirmedAt && application.refundBank
      ? { bank: application.refundBank, accountNumber: application.refundAccountNumber!, accountHolder: application.refundAccountHolder! } : null,
    refundRequestedAt: application.refundRequestedAt?.toISOString() ?? null,
    refundCompletedAt: application.refundCompletedAt?.toISOString() ?? null,
  };
}

function summary(match: Match) {
  const seats = match.applications.filter((a) => seatHoldingStatuses.some((s) => s === a.status));
  const confirmed = match.applications.filter((a) => a.status === "CONFIRMED");
  return {
    id: match.id, slotId: match.courtSlotId, status: match.status,
    title: match.courtSlot?.courtUnit.court.name ?? match.title,
    startsAt: match.startsAt.toISOString(), endsAt: match.endsAt.toISOString(),
    guestFeeKrw: match.totalCourtFeeKrw ?? 0,
    approvalMode: match.courtSlot?.approvalMode ?? "OPERATOR",
    minParticipantCount: match.courtSlot?.minParticipantCount ?? 0,
    maxParticipantCount: match.recruitCount, seatCount: seats.length, confirmedCount: confirmed.length,
    remainingSpots: Math.max(0, match.recruitCount - seats.length),
    remainingGenderSpots: match.maleRecruitCount !== null && match.femaleRecruitCount !== null ? {
      male: Math.max(0, match.maleRecruitCount - seats.filter((a) => a.applicantGender === "MALE").length),
      female: Math.max(0, match.femaleRecruitCount - seats.filter((a) => a.applicantGender === "FEMALE").length),
    } : null,
    applicationDeadline: getApplicationDeadline(match.startsAt).toISOString(),
    judgementAt: getJudgementAt(match.startsAt).toISOString(),
    cancellationReason: match.cancellationReason,
  };
}

async function readMatch(prisma: PrismaClient, matchId: string) {
  await reconcileCourtMatch(prisma, matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: matchInclude });
  if (!match || match.courtSource !== "PARTNER_COURT") throw new DomainError("MATCH_NOT_FOUND", 404, "코트 매칭을 찾을 수 없어요.");
  return match;
}

/** Caller must first authorize access to the public slot (including private participant history). */
export async function getCourtMatchParticipation(prisma: PrismaClient, viewer: { id: string; profile: { gender: "MALE" | "FEMALE" | null } }, matchId: string) {
  const match = await readMatch(prisma, matchId);
  const application = match.applications.find((a) => a.applicantUserId === viewer.id);
  const info = summary(match);
  const isOperator = match.hostUserId === viewer.id;
  const legacy = !match.courtSlot || match.courtSlot.courtUnit.court.operatorApplication.applicantUserId !== match.hostUserId;
  let blockedReason: string | null = null;
  if (legacy) blockedReason = "이전 방식으로 개설된 코트 매칭은 새 신청을 받지 않아요.";
  else if (isOperator) blockedReason = "내가 개설한 코트 매칭이에요.";
  else if (application) blockedReason = "이미 신청한 코트 매칭이에요.";
  else if (match.status !== "OPEN" || match.courtSlot?.status !== "AVAILABLE") blockedReason = "지금은 참가 신청을 받지 않아요.";
  else if (new Date() >= getApplicationDeadline(match.startsAt)) blockedReason = "참가 신청이 마감됐어요.";
  else if (!viewer.profile.gender) blockedReason = "프로필에 성별을 입력해 주세요.";
  else if (info.remainingSpots === 0) blockedReason = "남은 자리가 없어요.";
  else if (info.remainingGenderSpots && (viewer.profile.gender === "MALE" ? info.remainingGenderSpots.male : info.remainingGenderSpots.female) === 0) blockedReason = "해당 성별의 자리가 모두 찼어요.";

  const canSeeAccount = application?.status === "ACCEPTED" || application?.status === "CONFIRMED";
  return {
    ...info, isOperator, legacy, canApply: blockedReason === null, blockedReason,
    application: application ? toApplication(application) : null,
    settlementAccount: canSeeAccount && match.settlementBank && match.settlementAccountNumber && match.settlementAccountHolder
      ? { bank: match.settlementBank, accountNumber: match.settlementAccountNumber, accountHolder: match.settlementAccountHolder } : null,
    chatHref: match.conversation && (isOperator || application?.confirmedAt || (legacy && application?.status === "ACCEPTED")) ? `/chats/${match.id}` : null,
  };
}

export async function getOperatorCourtMatch(prisma: PrismaClient, viewer: { id: string }, matchId: string) {
  const match = await readMatch(prisma, matchId);
  if (match.hostUserId !== viewer.id || match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== viewer.id) {
    throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 조회할 수 있어요.");
  }
  const showProfile = match.courtSlot.approvalMode === "OPERATOR";
  return {
    ...summary(match),
    applications: match.applications.map((application) => ({
      ...toApplication(application),
      ...(showProfile ? { profileSnapshot: application.profileSnapshot, message: application.message } : {}),
    })),
  };
}

export type CourtMatchParticipation = Awaited<ReturnType<typeof getCourtMatchParticipation>>;
export type OperatorCourtMatch = Awaited<ReturnType<typeof getOperatorCourtMatch>>;
