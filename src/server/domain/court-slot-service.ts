import { Prisma } from "@/generated/prisma/client";
import type { CourtSlotStatus, MatchStatus, PrismaClient } from "@/generated/prisma/client";

import { DomainError } from "@/server/domain/profile-service";
import { makeConversationReadOnly } from "@/server/domain/match-chat-service";

import type {
  CourtCreateInput,
  CourtSlotCreateInput,
  CourtSlotListQuery,
  CourtSlotUpdateInput,
  CourtSupplyIncidentInput,
} from "./court-slot";

const draftAccessStatuses = ["DRAFT_ACCESS_GRANTED", "PUBLISH_APPROVED"] as const;

const courtInclude = {
  region: true,
  units: { orderBy: { name: "asc" } },
  images: { where: { status: "ATTACHED", isRepresentative: true }, select: { id: true }, take: 1 },
  operatorApplication: { select: { id: true, applicantUserId: true, status: true } },
} satisfies Prisma.CourtInclude;

const courtSlotInclude = {
  courtUnit: {
    include: {
      court: {
        include: {
          region: true,
          images: { where: { status: "ATTACHED", isRepresentative: true }, select: { id: true }, take: 1 },
          operatorApplication: { select: { id: true, applicantUserId: true, status: true } },
        },
      },
    },
  },
  match: { select: { id: true, hostUserId: true, status: true } },
} satisfies Prisma.CourtSlotInclude;

type CourtWithRelations = Prisma.CourtGetPayload<{ include: typeof courtInclude }>;
type CourtSlotWithRelations = Prisma.CourtSlotGetPayload<{ include: typeof courtSlotInclude }>;

const slotStatusLabels: Record<CourtSlotStatus, string> = {
  DRAFT: "비공개 초안",
  AVAILABLE: "세션 열기 가능",
  ALLOCATED: "세션 모집 중",
  ENDED: "종료됨",
  BLOCKED: "운영자가 중지했어요",
  CANCELLED: "취소됨",
};

const sessionStatusLabels: Record<MatchStatus, string> = {
  OPEN: "세션 모집 중",
  CLOSED: "모집이 마감됐어요",
  COMPLETED: "이용이 완료됐어요",
  EXPIRED: "성사 없이 종료됐어요",
  CANCELLED: "세션이 취소됐어요",
};

function optionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function canCreatePrivateDraft(status: string) {
  return draftAccessStatuses.includes(status as (typeof draftAccessStatuses)[number]);
}

function canPublish(status: string) {
  return status === "PUBLISH_APPROVED";
}

function isCourtActive(status: string) {
  return status === "ACTIVE";
}

function isPubliclySuppliedCourt(court: CourtSlotWithRelations["courtUnit"]["court"]) {
  return isCourtActive(court.status) && canPublish(court.operatorApplication.status);
}

function toCourtView(court: CourtWithRelations) {
  return {
    id: court.id,
    name: court.name,
    address: court.address,
    region: { code: court.region.code, name: court.region.name },
    status: court.status,
    operatorApplicationStatus: court.operatorApplication.status,
    units: court.units.map((unit) => ({ id: unit.id, name: unit.name })),
    createdAt: court.createdAt.toISOString(),
    updatedAt: court.updatedAt.toISOString(),
  };
}

export function toCourtSlotView(slot: CourtSlotWithRelations, now = new Date()) {
  const canOpenSession = slot.status === "AVAILABLE" && slot.startsAt > now;
  const session = slot.match
    ? { matchId: slot.match.id, status: slot.match.status, statusLabel: sessionStatusLabels[slot.match.status] }
    : null;
  const court = slot.courtUnit.court;
  const representativeImage = isPubliclySuppliedCourt(court) ? court.images?.[0] : null;

  return {
    id: slot.id,
    visibility: slot.visibility,
    status: slot.status,
    statusLabel: slotStatusLabels[slot.status],
    statusChangedAt: slot.statusChangedAt.toISOString(),
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    totalCourtFeeKrw: slot.priceKrw,
    maxParticipantCount: slot.maxParticipantCount,
    usageNote: slot.usageNote,
    court: {
      id: court.id,
      name: court.name,
      address: court.address,
      courtNumber: slot.courtUnit.name,
      region: { code: court.region.code, name: court.region.name },
      image: representativeImage
        ? { url: `/api/v1/partner-courts/${court.id}/image`, sourceLabel: "운영자 제공 사진", fallback: "TENNIS_COURT_ILLUSTRATION" as const }
        : { url: null, sourceLabel: null, fallback: "TENNIS_COURT_ILLUSTRATION" as const },
    },
    session,
    availableAction: canOpenSession ? "OPEN_SESSION" : slot.status === "ALLOCATED" && session ? "VIEW_SESSION" : "READ_ONLY",
    version: slot.version,
  };
}

async function getDraftAccessApplication(prisma: PrismaClient, userId: string) {
  const application = await prisma.courtOperatorApplication.findFirst({
    where: { applicantUserId: userId, status: { in: [...draftAccessStatuses] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      venueName: true,
      venueAddress: true,
      normalizedVenueKey: true,
    },
  });
  if (!application) {
    throw new DomainError("OPERATOR_DRAFT_ACCESS_REQUIRED", 403, "코트와 시간대 초안을 만들 수 있는 운영자 확인이 필요해요.");
  }
  return application;
}

async function getOwnedCourt(prisma: PrismaClient, viewer: { id: string }, courtId: string) {
  const court = await prisma.court.findFirst({
    where: { id: courtId, operatorApplication: { applicantUserId: viewer.id } },
    include: courtInclude,
  });
  if (!court) throw new DomainError("COURT_NOT_FOUND", 404, "코트장을 찾을 수 없어요.");
  if (!isCourtActive(court.status)) {
    throw new DomainError("COURT_INACTIVE", 403, "비활성화된 코트에는 새 시간대를 만들 수 없어요.");
  }
  if (!canCreatePrivateDraft(court.operatorApplication.status)) {
    throw new DomainError("OPERATOR_DRAFT_ACCESS_REQUIRED", 403, "현재 상태에서는 코트 시간대 초안을 만들 수 없어요.");
  }
  return court;
}

async function getOwnedCourtSlot(prisma: PrismaClient, viewer: { id: string }, slotId: string) {
  const slot = await prisma.courtSlot.findFirst({
    where: {
      id: slotId,
      courtUnit: { court: { operatorApplication: { applicantUserId: viewer.id } } },
    },
    include: courtSlotInclude,
  });
  if (!slot) throw new DomainError("COURT_SLOT_NOT_FOUND", 404, "코트 시간대를 찾을 수 없어요.");
  return slot;
}

function assertPublishAccess(slot: CourtSlotWithRelations) {
  if (!isCourtActive(slot.courtUnit.court.status)) {
    throw new DomainError("COURT_INACTIVE", 403, "비활성화된 코트는 시간을 공개할 수 없어요.");
  }
  if (!canPublish(slot.courtUnit.court.operatorApplication.status)) {
    throw new DomainError("OPERATOR_PUBLISH_APPROVAL_REQUIRED", 403, "공개하려면 운영자 공개 승인이 필요해요.");
  }
}

async function assertNoActiveSupplyRestriction(prisma: PrismaClient, operatorApplicationId: string) {
  const restriction = await prisma.operatorSupplyRestriction.findFirst({
    where: { operatorApplicationId, clearedAt: null },
    select: { id: true },
  });
  if (restriction) {
    throw new DomainError("OPERATOR_SUPPLY_RESTRICTED", 403, "운영상 확인이 끝날 때까지 새 시간 공개를 잠시 멈췄어요.");
  }
}

function isOverlapConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.message.includes("court_slots_unit_time_no_overlap");
}

export async function getMyCourts(prisma: PrismaClient, viewer: { id: string }) {
  const courts = await prisma.court.findMany({
    where: { operatorApplication: { applicantUserId: viewer.id } },
    include: courtInclude,
    orderBy: { createdAt: "desc" },
  });
  return { items: courts.map(toCourtView) };
}

export async function createCourt(prisma: PrismaClient, viewer: { id: string }, input: CourtCreateInput) {
  const application = await getDraftAccessApplication(prisma, viewer.id);
  const region = await prisma.region.findFirst({
    where: { code: input.regionCode, active: true, type: "DISTRICT" },
    select: { code: true },
  });
  if (!region) throw new DomainError("INVALID_REGION", 422, "활성화된 시·군·구를 선택해 주세요.");

  const existing = await prisma.court.findUnique({ where: { operatorApplicationId: application.id }, select: { id: true } });
  if (existing) throw new DomainError("COURT_ALREADY_EXISTS", 409, "이 운영자 신청에 연결된 코트장이 이미 있어요.");

  try {
    const court = await prisma.court.create({
      data: {
        operatorApplicationId: application.id,
        regionCode: region.code,
        name: application.venueName,
        address: application.venueAddress,
        normalizedVenueKey: application.normalizedVenueKey,
      },
      include: courtInclude,
    });
    return toCourtView(court);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("COURT_ALREADY_EXISTS", 409, "이 운영자 신청에 연결된 코트장이 이미 있어요.");
    }
    throw error;
  }
}

export async function createCourtSlot(prisma: PrismaClient, viewer: { id: string }, courtId: string, input: CourtSlotCreateInput) {
  await getOwnedCourt(prisma, viewer, courtId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  try {
    return await prisma.$transaction(async (transaction) => {
      const existingUnit = await transaction.courtUnit.findUnique({
        where: { courtId_name: { courtId, name: input.courtUnitName } },
      });
      const courtUnit = existingUnit ?? await transaction.courtUnit.create({ data: { courtId, name: input.courtUnitName } });

      const overlap = await transaction.courtSlot.findFirst({
        where: {
          courtUnitId: courtUnit.id,
          status: { in: ["DRAFT", "AVAILABLE", "ALLOCATED"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });
      if (overlap) throw new DomainError("COURT_SLOT_OVERLAP", 409, "같은 코트 면에 겹치는 시간대가 있어요.");

      const now = new Date();
      const slot = await transaction.courtSlot.create({
        data: {
          courtUnitId: courtUnit.id,
          startsAt,
          endsAt,
          priceKrw: input.priceKrw,
          maxParticipantCount: input.maxParticipantCount,
          usageNote: optionalText(input.usageNote),
          statusChangedAt: now,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: "DRAFT",
              actor: "OPERATOR",
              actorUserId: viewer.id,
              reasonCode: "SLOT_DRAFT_CREATED",
            },
          },
        },
        include: courtSlotInclude,
      });
      return toCourtSlotView(slot, now);
    });
  } catch (error) {
    if (isOverlapConstraintError(error)) {
      throw new DomainError("COURT_SLOT_OVERLAP", 409, "같은 코트 면에 겹치는 시간대가 있어요.");
    }
    throw error;
  }
}

export async function getMyCourtSlots(prisma: PrismaClient, viewer: { id: string }, query: CourtSlotListQuery = {}) {
  const [slots, restriction] = await Promise.all([
    prisma.courtSlot.findMany({
      where: {
        courtUnit: { court: { operatorApplication: { applicantUserId: viewer.id } } },
        ...(query.status ? { status: query.status } : {}),
      },
      include: courtSlotInclude,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    }),
    prisma.operatorSupplyRestriction.findFirst({
      where: { operatorApplication: { applicantUserId: viewer.id }, clearedAt: null },
      select: { triggeredAt: true, reasonCode: true },
      orderBy: { triggeredAt: "desc" },
    }),
  ]);
  const now = new Date();
  return {
    items: slots.map((slot) => toCourtSlotView(slot, now)),
    supplyRestriction: restriction
      ? { active: true, triggeredAt: restriction.triggeredAt.toISOString(), reasonCode: restriction.reasonCode }
      : { active: false },
  };
}

export async function updateCourtSlot(
  prisma: PrismaClient,
  viewer: { id: string },
  slotId: string,
  input: CourtSlotUpdateInput,
) {
  const slot = await getOwnedCourtSlot(prisma, viewer, slotId);
  if (slot.status !== "DRAFT" || slot.visibility !== "PRIVATE") {
    throw new DomainError("COURT_SLOT_PUBLIC_IMMUTABLE", 409, "공개했거나 연결된 시간은 바로 수정할 수 없어요. 새 초안으로 정정해 주세요.");
  }
  if (slot.version !== input.expectedVersion) {
    throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "다른 변경사항이 있어 시간대를 다시 확인해 주세요.");
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  try {
    return await prisma.$transaction(async (transaction) => {
      const courtId = slot.courtUnit.court.id;
      const existingUnit = await transaction.courtUnit.findUnique({
        where: { courtId_name: { courtId, name: input.courtUnitName } },
      });
      const courtUnit = existingUnit ?? await transaction.courtUnit.create({
        data: { courtId, name: input.courtUnitName },
      });
      const overlap = await transaction.courtSlot.findFirst({
        where: {
          id: { not: slot.id },
          courtUnitId: courtUnit.id,
          status: { in: ["DRAFT", "AVAILABLE", "ALLOCATED"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });
      if (overlap) throw new DomainError("COURT_SLOT_OVERLAP", 409, "같은 코트 면에 겹치는 시간대가 있어요.");

      const updated = await transaction.courtSlot.updateMany({
        where: { id: slot.id, status: "DRAFT", visibility: "PRIVATE", version: input.expectedVersion },
        data: {
          courtUnitId: courtUnit.id,
          startsAt,
          endsAt,
          priceKrw: input.priceKrw,
          maxParticipantCount: input.maxParticipantCount,
          usageNote: optionalText(input.usageNote),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "다른 변경사항이 있어 시간대를 다시 확인해 주세요.");
      return transaction.courtSlot.findUniqueOrThrow({ where: { id: slot.id }, include: courtSlotInclude });
    });
  } catch (error) {
    if (isOverlapConstraintError(error)) throw new DomainError("COURT_SLOT_OVERLAP", 409, "같은 코트 면에 겹치는 시간대가 있어요.");
    throw error;
  }
}

async function transitionSlot(
  prisma: PrismaClient,
  viewer: { id: string },
  slotId: string,
  nextStatus: "AVAILABLE" | "BLOCKED",
) {
  const slot = await getOwnedCourtSlot(prisma, viewer, slotId);
  assertPublishAccess(slot);
  if (nextStatus === "AVAILABLE") {
    await assertNoActiveSupplyRestriction(prisma, slot.courtUnit.court.operatorApplication.id);
  }

  if (nextStatus === "AVAILABLE") {
    if (slot.status !== "DRAFT" || slot.visibility !== "PRIVATE") {
      throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "비공개 초안 시간대만 공개할 수 있어요.");
    }
    if (slot.startsAt <= new Date()) {
      throw new DomainError("COURT_SLOT_ALREADY_STARTED", 409, "이미 시작된 시간대는 공개할 수 없어요.");
    }
  } else {
    const canBlockCancelledSession = slot.status === "ALLOCATED" && slot.match?.status === "CANCELLED";
    if (slot.status !== "AVAILABLE" && !canBlockCancelledSession) {
      throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "세션 열기 가능 상태 또는 취소된 세션 연결 시간대만 중지할 수 있어요.");
    }
  }

  const isCancelledSessionConfirmation = nextStatus === "BLOCKED" && slot.status === "ALLOCATED" && slot.match?.status === "CANCELLED";

  const now = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.courtSlot.updateMany({
      where: {
        id: slot.id,
        status: slot.status,
        visibility: slot.visibility,
        version: slot.version,
        courtUnit: { court: { status: "ACTIVE", operatorApplication: { status: "PUBLISH_APPROVED" } } },
      },
      data: {
        status: nextStatus,
        ...(nextStatus === "AVAILABLE" ? { visibility: "PUBLIC", publishedAt: now } : {}),
        statusChangedAt: now,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "다른 변경사항이 있어 시간대를 다시 확인해 주세요.");
    }
    await transaction.courtSlotStatusHistory.create({
      data: {
        courtSlotId: slot.id,
        fromStatus: slot.status,
        toStatus: nextStatus,
        actor: "OPERATOR",
        actorUserId: viewer.id,
        reasonCode: nextStatus === "AVAILABLE"
          ? "SLOT_PUBLISHED"
          : isCancelledSessionConfirmation
            ? "SESSION_HOST_CANCELLED_CONFIRMED"
            : "SLOT_BLOCKED_BY_OPERATOR",
      },
    });
    return transaction.courtSlot.findUniqueOrThrow({ where: { id: slot.id }, include: courtSlotInclude });
  });
  return toCourtSlotView(result, now);
}

export function publishCourtSlot(prisma: PrismaClient, viewer: { id: string }, slotId: string) {
  return transitionSlot(prisma, viewer, slotId, "AVAILABLE");
}

export function blockCourtSlot(prisma: PrismaClient, viewer: { id: string }, slotId: string) {
  return transitionSlot(prisma, viewer, slotId, "BLOCKED");
}

function isOperatorAttributableIncident(code: CourtSupplyIncidentInput["code"]) {
  return code === "SCHEDULE_UNAVAILABLE";
}

function isEmergencySupplyIncident(code: CourtSupplyIncidentInput["code"]) {
  return code !== "INFORMATION_REVIEW";
}

async function createAutomatedRestrictionIfNeeded(
  transaction: Prisma.TransactionClient,
  operatorApplicationId: string,
  startsAt: Date,
  now: Date,
) {
  const [recentWithdrawals, activeRestriction] = await Promise.all([
    transaction.courtSupplyIncident.count({
      where: {
        status: "WITHDRAWN",
        operatorAttributable: true,
        withdrawnAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        courtSlot: { courtUnit: { court: { operatorApplicationId } } },
      },
    }),
    transaction.operatorSupplyRestriction.findFirst({
      where: { operatorApplicationId, clearedAt: null },
      select: { id: true },
    }),
  ]);
  const startsUntil = startsAt.getTime() - now.getTime();
  const startsWithinDay = startsUntil >= 0 && startsUntil <= 24 * 60 * 60 * 1000;
  if (!activeRestriction && (recentWithdrawals >= 2 || startsWithinDay)) {
    await transaction.operatorSupplyRestriction.create({
      data: {
        operatorApplicationId,
        source: "AUTOMATED",
        reasonCode: startsWithinDay ? "ATTRIBUTABLE_WITHDRAWAL_WITHIN_24H" : "ATTRIBUTABLE_WITHDRAWALS_30D",
        triggeredAt: now,
      },
    });
  }
}

export async function reportCourtSupplyIncident(
  prisma: PrismaClient,
  viewer: { id: string },
  slotId: string,
  input: CourtSupplyIncidentInput,
) {
  const slot = await getOwnedCourtSlot(prisma, viewer, slotId);
  if (slot.status !== "ALLOCATED" || !slot.match || slot.version !== input.expectedVersion) {
    throw new DomainError("COURT_SUPPLY_INCIDENT_NOT_ALLOWED", 409, "연결된 세션에서만 운영상 문제를 접수할 수 있어요.");
  }

  const now = new Date();
  const emergency = isEmergencySupplyIncident(input.code);
  const operatorAttributable = isOperatorAttributableIncident(input.code);
  return prisma.$transaction(async (transaction) => {
    if (!emergency) {
      const incident = await transaction.courtSupplyIncident.create({
        data: {
          courtSlotId: slot.id,
          matchId: slot.match!.id,
          code: input.code,
          impact: "NONE",
          status: "REQUESTED",
          operatorAttributable: false,
          publicNoticeCode: "INFORMATION_REVIEW_REQUESTED",
          reportedAt: now,
        },
      });
      return { id: incident.id, status: "REQUESTED" as const, impact: "NONE" as const, message: "운영 검토에 접수했어요. 시간과 연결된 세션은 그대로 유지돼요." };
    }

    const cancelledSlot = await transaction.courtSlot.updateMany({
      where: { id: slot.id, status: "ALLOCATED", version: input.expectedVersion },
      data: { status: "CANCELLED", statusChangedAt: now, version: { increment: 1 } },
    });
    if (cancelledSlot.count !== 1) throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "다른 변경사항이 있어 시간대를 다시 확인해 주세요.");

    const cancelledMatch = await transaction.match.updateMany({
      where: { id: slot.match!.id, status: { in: ["OPEN", "CLOSED"] } },
      data: { status: "CANCELLED", cancelledAt: now, cancellationReason: "COURT_SUPPLY_WITHDRAWN", version: { increment: 1 } },
    });
    if (cancelledMatch.count !== 1) throw new DomainError("COURT_SLOT_STATE_CONFLICT", 409, "연결된 세션 상태를 다시 확인해 주세요.");

    await transaction.matchApplication.updateMany({
      where: { matchId: slot.match!.id, status: { in: ["PENDING", "ACCEPTED"] } },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    await makeConversationReadOnly(transaction, slot.match!.id, "코트 운영 사정으로 매칭이 취소되어 이 채팅방은 읽기 전용이에요.", now);
    const incident = await transaction.courtSupplyIncident.create({
      data: {
        courtSlotId: slot.id,
        matchId: slot.match!.id,
        code: input.code,
        impact: "CANCEL_MATCH",
        status: "WITHDRAWN",
        operatorAttributable,
        publicNoticeCode: "COURT_SUPPLY_WITHDRAWN",
        reportedAt: now,
        withdrawnAt: now,
      },
    });
    await transaction.courtSlotStatusHistory.create({
      data: {
        courtSlotId: slot.id,
        fromStatus: "ALLOCATED",
        toStatus: "CANCELLED",
        actor: "OPERATOR",
        actorUserId: viewer.id,
        reasonCode: "SUPPLY_WITHDRAWN",
      },
    });
    const affectedApplications = await transaction.matchApplication.findMany({
      where: { matchId: slot.match!.id, status: "CANCELLED", cancelledAt: now },
      select: { applicantUserId: true },
    });
    const recipients = Array.from(new Set([slot.match!.hostUserId, ...affectedApplications.map(({ applicantUserId }) => applicantUserId)]));
    await transaction.matchSupplyNoticeRecipient.createMany({
      data: recipients.map((recipientUserId) => ({
        incidentId: incident.id,
        matchId: slot.match!.id,
        recipientUserId,
        noticeCode: "COURT_SUPPLY_WITHDRAWN",
        deliveredAt: now,
      })),
    });
    if (operatorAttributable) {
      await createAutomatedRestrictionIfNeeded(transaction, slot.courtUnit.court.operatorApplication.id, slot.startsAt, now);
    }
    return { id: incident.id, status: "WITHDRAWN" as const, impact: "CANCEL_MATCH" as const, message: "연결된 세션을 취소하고 모집자와 신청자에게 앱 안에서 안내했어요." };
  });
}

/**
 * CP01 목록은 아직 끝나지 않은 공개 시간만 시간순으로 보여 준다. 이미 지난 시간은
 * `ENDED`로 남아 있어도 목록에서 빼고, 상태·갱신 시각이 필요하면 상세 경로에서 읽는다.
 * 목록에는 페이징 UI가 없으므로 가장 가까운 시간부터 `publicCourtSlotListLimit`개까지만 읽는다.
 */
export const publicCourtSlotListLimit = 50;

export async function getPublicCourtSlots(prisma: PrismaClient, availableOnly: boolean, limit = publicCourtSlotListLimit) {
  const now = new Date();
  const slots = await prisma.courtSlot.findMany({
    where: {
      visibility: "PUBLIC",
      courtUnit: { court: { status: "ACTIVE", operatorApplication: { status: "PUBLISH_APPROVED" } } },
      ...(availableOnly ? { status: "AVAILABLE", startsAt: { gt: now } } : { endsAt: { gt: now } }),
    },
    include: courtSlotInclude,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  return { items: slots.map((slot) => toCourtSlotView(slot, now)) };
}

/** A public Slot is a session-supply record, never a direct court reservation. */
export async function getPublicCourtSlot(prisma: PrismaClient, slotId: string) {
  const now = new Date();
  const slot = await prisma.courtSlot.findFirst({
    where: {
      id: slotId,
      visibility: "PUBLIC",
      courtUnit: { court: { status: "ACTIVE", operatorApplication: { status: "PUBLISH_APPROVED" } } },
    },
    include: courtSlotInclude,
  });
  if (!slot) throw new DomainError("PARTNER_SLOT_NOT_AVAILABLE", 404, "이 제휴 코트 시간은 확인할 수 없어요.");
  return toCourtSlotView(slot, now);
}
