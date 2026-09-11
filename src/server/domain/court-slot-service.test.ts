import { describe, expect, it, vi } from "vitest";

import { courtSlotCreateInputSchema, courtSlotUpdateInputSchema, courtSupplyIncidentInputSchema } from "./court-slot";
import { blockCourtSlot, createCourt, createCourtSlot, getMyCourtSlots, getPublicCourtSlot, getPublicCourtSlots, publicCourtSlotListLimit, publishCourtSlot, reportCourtSupplyIncident, updateCourtSlot } from "./court-slot-service";

const viewer = { id: "operator-user-id" };
const futureStartsAt = new Date("2030-01-02T01:00:00.000Z");
const futureEndsAt = new Date("2030-01-02T03:00:00.000Z");

const slotInput = courtSlotCreateInputSchema.parse({
  courtUnitName: "2번 코트",
  startsAt: futureStartsAt.toISOString(),
  endsAt: futureEndsAt.toISOString(),
  priceKrw: 40_000,
  maxParticipantCount: 4,
  minParticipantCount: 2,
  gameType: "MIXED_DOUBLES",
  maleCapacity: 2,
  femaleCapacity: 2,
  approvalMode: "AUTO",
  usageNote: "실내 전용 테니스화를 준비해 주세요.",
});

function ownedCourt(status: "DRAFT_ACCESS_GRANTED" | "PUBLISH_APPROVED" = "DRAFT_ACCESS_GRANTED") {
  return {
    id: "court-id",
    operatorApplicationId: "application-id",
    regionCode: "SEOUL-001",
    name: "마포 테니스파크",
    address: "서울특별시 마포구 월드컵로 00",
    settlementBank: "테스트은행",
    settlementAccountNumber: "123-456-789",
    settlementAccountHolder: "마포테니스파크",
    normalizedVenueKey: "venue-key",
    status: "ACTIVE",
    deactivatedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    region: { code: "SEOUL-001", name: "마포구" },
    units: [],
    operatorApplication: { applicantUserId: viewer.id, status },
  };
}

function ownedSlot(applicationStatus: "DRAFT_ACCESS_GRANTED" | "PUBLISH_APPROVED") {
  return {
    id: "slot-id",
    courtUnitId: "unit-id",
    startsAt: futureStartsAt,
    endsAt: futureEndsAt,
    priceKrw: 40_000,
    maxParticipantCount: 4,
    minParticipantCount: 2,
    gameType: "MIXED_DOUBLES",
    maleCapacity: 2,
    femaleCapacity: 2,
    approvalMode: "AUTO",
    visibility: "PRIVATE",
    status: "DRAFT",
    publishedAt: null,
    statusChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    usageNote: null,
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    courtUnit: {
      name: "2번 코트",
      court: {
        ...ownedCourt(applicationStatus),
        operatorApplication: { applicantUserId: viewer.id, status: applicationStatus },
      },
    },
    match: null,
  };
}

describe("Court Partner time supply authorization and state transitions", () => {
  it("rejects invalid or non-future time slots before persistence", () => {
    expect(() => courtSlotCreateInputSchema.parse({ ...slotInput, endsAt: slotInput.startsAt })).toThrow("종료 시간");
    expect(() => courtSlotCreateInputSchema.parse({ ...slotInput, startsAt: "2020-01-02T01:00:00.000Z" })).toThrow("시작 시간");
    expect(() => courtSlotCreateInputSchema.parse({ ...slotInput, maxParticipantCount: 1 })).toThrow("2명");
    expect(() => courtSlotUpdateInputSchema.parse({ ...slotInput, expectedVersion: 0 })).toThrow("다시 불러와");
    expect(() => courtSupplyIncidentInputSchema.parse({ code: "INFORMATION_REVIEW", expectedVersion: 0 })).toThrow("다시 불러와");
  });

  it("allows a draft-approved operator to create only a private slot draft with an audit record", async () => {
    const created = { ...ownedSlot("DRAFT_ACCESS_GRANTED"), statusChangedAt: new Date(), usageNote: slotInput.usageNote };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      courtUnit: { findUnique: vi.fn().mockResolvedValue({ id: "unit-id" }) },
      courtSlot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      court: { findFirst: vi.fn().mockResolvedValue(ownedCourt()) },
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as Parameters<typeof createCourtSlot>[0];

    const result = await createCourtSlot(prisma, viewer, "court-id", slotInput);

    expect(result).toMatchObject({ id: "slot-id", visibility: "PRIVATE", status: "DRAFT", availableAction: "READ_ONLY" });
    expect(transaction.courtSlot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        statusHistory: expect.objectContaining({ create: expect.objectContaining({ actor: "OPERATOR", toStatus: "DRAFT", reasonCode: "SLOT_DRAFT_CREATED" }) }),
      }),
    }));
  });

  it("requires publish approval before a private draft can become a public available slot", async () => {
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(ownedSlot("DRAFT_ACCESS_GRANTED")) },
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof publishCourtSlot>[0];

    await expect(publishCourtSlot(prisma, viewer, "slot-id")).rejects.toMatchObject({
      code: "OPERATOR_PUBLISH_APPROVAL_REQUIRED",
      status: 403,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not create a court for a user without draft access", async () => {
    const prisma = {
      courtOperatorApplication: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as Parameters<typeof createCourt>[0];

    await expect(createCourt(prisma, viewer, { regionCode: "SEOUL-001" })).rejects.toMatchObject({
      code: "OPERATOR_DRAFT_ACCESS_REQUIRED",
      status: 403,
    });
  });

  it("does not allow a public time slot to be edited in place", async () => {
    const publicSlot = { ...ownedSlot("PUBLISH_APPROVED"), visibility: "PUBLIC", status: "AVAILABLE" };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(publicSlot) },
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof updateCourtSlot>[0];

    await expect(updateCourtSlot(prisma, viewer, "slot-id", { ...slotInput, expectedVersion: 1 })).rejects.toMatchObject({
      code: "COURT_SLOT_PUBLIC_IMMUTABLE",
      status: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns only a public slot with its safe court image fallback and supply action", async () => {
    // 공개된 시간에는 운영자가 연 코트 매칭이 붙어 있다. 공개 = 모집 시작이다.
    const publicSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "AVAILABLE",
      match: {
        id: "match-id",
        hostUserId: "operator-user-id",
        status: "OPEN",
        title: "마포 테니스파크 2번 코트",
        recruitCount: 4,
        partnerPreference: "COMPLETE_BEGINNER_WELCOME",
        host: { status: "ACTIVE", nickname: "마포테니스파크" },
        purposes: [],
        _count: { applications: 0 },
      },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(publicSlot) },
    } as unknown as Parameters<typeof getPublicCourtSlot>[0];

    await expect(getPublicCourtSlot(prisma, "slot-id")).resolves.toMatchObject({
      id: "slot-id",
      availableAction: "APPLY",
      court: { image: { url: null, sourceLabel: null, fallback: "TENNIS_COURT_ILLUSTRATION" } },
    });
    expect(prisma.courtSlot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "slot-id", visibility: "PUBLIC" }),
    }));
  });

  it("filters public slots to active courts owned by currently approved operators", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { courtSlot: { findMany } } as unknown as Parameters<typeof getPublicCourtSlots>[0];

    await expect(getPublicCourtSlots(prisma, true)).resolves.toEqual({ items: [] });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        visibility: "PUBLIC",
        courtUnit: { court: { status: "ACTIVE", operatorApplication: { status: "PUBLISH_APPROVED", applicant: { status: "ACTIVE" } } } },
      }),
    }));
  });

  it("keeps finished times out of the public slot list", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { courtSlot: { findMany } } as unknown as Parameters<typeof getPublicCourtSlots>[0];

    await expect(getPublicCourtSlots(prisma, false)).resolves.toEqual({ items: [] });

    const [{ where, orderBy, take }] = findMany.mock.calls[0] as [{ where: { endsAt: { gt: Date }; status?: string }; orderBy: unknown; take: number }];
    expect(where.endsAt.gt).toBeInstanceOf(Date);
    expect(where.status).toBeUndefined();
    expect(orderBy).toEqual([{ startsAt: "asc" }, { id: "asc" }]);
    expect(take).toBe(publicCourtSlotListLimit);
  });

  it("shows the linked session's recruiting summary on a public slot", async () => {
    const allocatedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "AVAILABLE",
      match: {
        id: "match-id",
        hostUserId: "host-user-id",
        status: "OPEN",
        title: "편하게 랠리해요",
        recruitCount: 3,
        partnerPreference: "COMPLETE_BEGINNER_WELCOME",
        host: { status: "ACTIVE", nickname: "민지" },
        purposes: [{ purpose: "RALLY_PRACTICE" }],
        _count: { applications: 1 },
      },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(allocatedSlot) },
    } as unknown as Parameters<typeof getPublicCourtSlot>[0];

    await expect(getPublicCourtSlot(prisma, "slot-id")).resolves.toMatchObject({
      availableAction: "APPLY",
      durationMinutes: 120,
      session: {
        matchId: "match-id",
        title: "편하게 랠리해요",
        hostNickname: "민지",
        recruitCount: 3,
        acceptedCount: 1,
        remainingSpots: 2,
        beginnerWelcome: true,
        playPurposes: [{ code: "RALLY_PRACTICE", label: "랠리" }],
      },
    });
  });

  it("counts what the operator has to act on, and only refunds it can actually send", async () => {
    const linkedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "AVAILABLE",
      match: { id: "match-id", hostUserId: "operator-user-id", status: "OPEN" },
    };
    const findMany = vi.fn().mockResolvedValue([linkedSlot]);
    const applications = vi.fn().mockResolvedValue([
      { matchId: "match-id", status: "PENDING", depositClaimedAt: null, confirmedAt: null, refundRequestedAt: null, refundCompletedAt: null },
      // 입금했다고 알린 건만 운영자가 확인할 수 있다.
      { matchId: "match-id", status: "ACCEPTED", depositClaimedAt: new Date(), confirmedAt: null, refundRequestedAt: null, refundCompletedAt: null },
      { matchId: "match-id", status: "ACCEPTED", depositClaimedAt: null, confirmedAt: null, refundRequestedAt: null, refundCompletedAt: null },
      { matchId: "match-id", status: "CONFIRMED", depositClaimedAt: new Date(), confirmedAt: new Date(), refundRequestedAt: null, refundCompletedAt: null },
      // 환불 대기지만 계좌를 아직 안 넣었으면 운영자가 보낼 수 없다.
      { matchId: "match-id", status: "CANCELLED", depositClaimedAt: new Date(), confirmedAt: new Date(), refundRequestedAt: null, refundCompletedAt: null },
      { matchId: "match-id", status: "CANCELLED", depositClaimedAt: new Date(), confirmedAt: new Date(), refundRequestedAt: new Date(), refundCompletedAt: null },
    ].map((a) => ({ ...a, receivedAmountKrw: null, refundAmountKrw: null, legacyRefundPaidKrw: 0, refundAttempts: [], match: { totalCourtFeeKrw: 36000 } })));
    const prisma = {
      courtSlot: { findMany },
      matchApplication: { findMany: applications },
      operatorSupplyRestriction: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as Parameters<typeof getMyCourtSlots>[0];

    const result = await getMyCourtSlots(prisma, viewer);

    expect(result.items[0].actions).toEqual({ pendingApproval: 1, depositToConfirm: 1, refundToComplete: 1, confirmed: 1 });
  });

  it("keeps a blocked slot read-only even though a session is still linked", async () => {
    // 운영자가 공개를 중지했거나 시간이 끝났으면 상세로 보내지 않는다(03-1 §7.1).
    const blockedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "BLOCKED",
      match: {
        id: "match-id",
        hostUserId: "operator-user-id",
        status: "CANCELLED",
        title: "마포 테니스파크 2번 코트",
        recruitCount: 4,
        partnerPreference: "COMPLETE_BEGINNER_WELCOME",
        host: { status: "ACTIVE", nickname: "마포테니스파크" },
        purposes: [],
        _count: { applications: 0 },
      },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(blockedSlot) },
    } as unknown as Parameters<typeof getPublicCourtSlot>[0];

    await expect(getPublicCourtSlot(prisma, "slot-id")).resolves.toMatchObject({ availableAction: "READ_ONLY" });
  });

  it("keeps the linked session's recruiting summary out of the operator's own slot list", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      courtSlot: { findMany },
      operatorSupplyRestriction: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as Parameters<typeof getMyCourtSlots>[0];

    await getMyCourtSlots(prisma, viewer);

    const [{ include }] = findMany.mock.calls[0] as [{ include: { match: { select: Record<string, unknown> } } }];
    expect(include.match.select).toEqual({ id: true, hostUserId: true, status: true });
  });

  it("only offers still-upcoming available times when a session host picks a slot", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { courtSlot: { findMany } } as unknown as Parameters<typeof getPublicCourtSlots>[0];

    await getPublicCourtSlots(prisma, true);

    const [{ where }] = findMany.mock.calls[0] as [{ where: { status: string; startsAt: { gt: Date }; endsAt?: unknown } }];
    expect(where.status).toBe("AVAILABLE");
    expect(where.startsAt.gt).toBeInstanceOf(Date);
    expect(where.endsAt).toBeUndefined();
  });

  it("does not publish an inactive court even when the operator application remains approved", async () => {
    const inactiveSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      courtUnit: {
        ...ownedSlot("PUBLISH_APPROVED").courtUnit,
        court: { ...ownedSlot("PUBLISH_APPROVED").courtUnit.court, status: "INACTIVE" },
      },
    };
    const prisma = { courtSlot: { findFirst: vi.fn().mockResolvedValue(inactiveSlot) }, $transaction: vi.fn() } as unknown as Parameters<typeof publishCourtSlot>[0];

    await expect(publishCourtSlot(prisma, viewer, "slot-id")).rejects.toMatchObject({ code: "COURT_INACTIVE", status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns only the saved representative facility photo through the protected public route", async () => {
    const publicSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "AVAILABLE",
      courtUnit: {
        ...ownedSlot("PUBLISH_APPROVED").courtUnit,
        court: { ...ownedSlot("PUBLISH_APPROVED").courtUnit.court, images: [{ id: "representative-image-id" }] },
      },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(publicSlot) },
    } as unknown as Parameters<typeof getPublicCourtSlot>[0];

    await expect(getPublicCourtSlot(prisma, "slot-id")).resolves.toMatchObject({
      court: {
        image: {
          url: "/api/v1/partner-courts/court-id/image",
          sourceLabel: "운영자 제공 사진",
          fallback: "TENNIS_COURT_ILLUSTRATION",
        },
      },
    });
  });

  it("lets only the operator confirm a host-cancelled allocated slot as blocked without changing the cancelled match", async () => {
    const allocatedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "ALLOCATED",
      version: 4,
      match: { id: "match-id", hostUserId: "host-user-id", status: "CANCELLED" },
    };
    const blockedSlot = { ...allocatedSlot, status: "BLOCKED", version: 5, statusChangedAt: new Date("2026-01-03T00:00:00.000Z") };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      courtSlot: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(blockedSlot),
      },
      courtSlotStatusHistory: { create: vi.fn().mockResolvedValue({ id: "history-id" }) },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(allocatedSlot) },
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as Parameters<typeof blockCourtSlot>[0];

    const result = await blockCourtSlot(prisma, viewer, "slot-id");

    expect(result).toMatchObject({ status: "BLOCKED", availableAction: "READ_ONLY" });
    expect(transaction.courtSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ALLOCATED", version: 4 }),
      data: expect.objectContaining({ status: "BLOCKED" }),
    }));
    expect(transaction.courtSlotStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromStatus: "ALLOCATED", toStatus: "BLOCKED", reasonCode: "SESSION_HOST_CANCELLED_CONFIRMED" }),
    }));
  });

  it("does not let an operator quietly block a published court match that has participants", async () => {
    // 공개 중지는 슬롯만 막는다. 살아 있는 코트 매칭에 쓰면 참가자가 취소 안내도
    // 환불도 못 받은 채 남는다.
    const publishedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "AVAILABLE",
      match: { id: "match-id", hostUserId: "operator-user-id", status: "OPEN" },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(publishedSlot) },
      operatorSupplyRestriction: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof blockCourtSlot>[0];

    await expect(blockCourtSlot(prisma, viewer, "slot-id")).rejects.toMatchObject({
      code: "COURT_MATCH_IN_PROGRESS",
      status: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("withdraws supply from a published court match and leaves paid participants awaiting a refund", async () => {
    const publishedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "AVAILABLE",
      version: 3,
      match: { id: "match-id", hostUserId: "operator-user-id", status: "OPEN" },
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      courtSlot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      match: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      matchApplication: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([{ applicantUserId: "applicant-id" }]),
      },
      matchConversation: { findUnique: vi.fn().mockResolvedValue(null) },
      courtSupplyIncident: { create: vi.fn().mockResolvedValue({ id: "incident-id" }), count: vi.fn().mockResolvedValue(0) },
      courtSlotStatusHistory: { create: vi.fn() },
      matchSupplyNoticeRecipient: { createMany: vi.fn() },
      operatorSupplyRestriction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(publishedSlot) },
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as Parameters<typeof reportCourtSupplyIncident>[0];

    await expect(reportCourtSupplyIncident(prisma, viewer, "slot-id", courtSupplyIncidentInputSchema.parse({
      code: "FACILITY_CLOSED",
      expectedVersion: 3,
    }))).resolves.toMatchObject({ impact: "CANCEL_MATCH" });

    // 입금까지 마친 참가자도 취소해야 환불 대기로 잡힌다.
    expect(transaction.matchApplication.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["PENDING", "ACCEPTED", "CONFIRMED"] } }),
    }));
    // 공개된 코트 매칭은 AVAILABLE에서 취소된다.
    expect(transaction.courtSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "AVAILABLE", version: 3 }),
    }));
  });

  it("does not let an operator block an allocated slot while its session is still active", async () => {
    const allocatedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "ALLOCATED",
      match: { id: "match-id", hostUserId: "host-user-id", status: "OPEN" },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(allocatedSlot) },
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof blockCourtSlot>[0];

    await expect(blockCourtSlot(prisma, viewer, "slot-id")).rejects.toMatchObject({
      code: "COURT_SLOT_STATE_CONFLICT",
      status: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a competing confirmation after another operator action already blocked the cancelled session slot", async () => {
    const allocatedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "ALLOCATED",
      version: 4,
      match: { id: "match-id", hostUserId: "host-user-id", status: "CANCELLED" },
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      courtSlot: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      courtSlotStatusHistory: { create: vi.fn() },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(allocatedSlot) },
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as Parameters<typeof blockCourtSlot>[0];

    await expect(blockCourtSlot(prisma, viewer, "slot-id")).rejects.toMatchObject({
      code: "COURT_SLOT_STATE_CONFLICT",
      status: 409,
    });
    expect(transaction.courtSlotStatusHistory.create).not.toHaveBeenCalled();
  });

  it("keeps the slot and match unchanged for a general information review request", async () => {
    const allocatedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "ALLOCATED",
      version: 4,
      match: { id: "match-id", hostUserId: "host-user-id", status: "OPEN" },
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      courtSupplyIncident: { create: vi.fn().mockResolvedValue({ id: "incident-id" }) },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(allocatedSlot) },
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as Parameters<typeof reportCourtSupplyIncident>[0];

    const result = await reportCourtSupplyIncident(prisma, viewer, "slot-id", { code: "INFORMATION_REVIEW", expectedVersion: 4 });

    expect(result).toMatchObject({ status: "REQUESTED", impact: "NONE" });
    expect(transaction.courtSupplyIncident.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REQUESTED", impact: "NONE", publicNoticeCode: "INFORMATION_REVIEW_REQUESTED" }),
    }));
  });

  it("withdraws an unavailable allocated supply atomically and records only affected in-app recipients", async () => {
    const allocatedSlot = {
      ...ownedSlot("PUBLISH_APPROVED"),
      visibility: "PUBLIC",
      status: "ALLOCATED",
      version: 4,
      match: { id: "match-id", hostUserId: "host-user-id", status: "OPEN" },
      courtUnit: {
        name: "2번 코트",
        court: {
          ...ownedCourt("PUBLISH_APPROVED"),
          operatorApplication: { id: "application-id", applicantUserId: viewer.id, status: "PUBLISH_APPROVED" },
        },
      },
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      courtSlot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      match: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      matchApplication: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([{ applicantUserId: "pending-user-id" }, { applicantUserId: "accepted-user-id" }]),
      },
      courtSupplyIncident: {
        create: vi.fn().mockResolvedValue({ id: "incident-id" }),
        count: vi.fn().mockResolvedValue(2),
      },
      courtSlotStatusHistory: { create: vi.fn().mockResolvedValue({ id: "history-id" }) },
      matchSupplyNoticeRecipient: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
      matchConversation: {
        findUnique: vi.fn().mockResolvedValue({ id: "conversation-id", status: "OPEN" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      matchChatMessage: { create: vi.fn().mockResolvedValue({ id: "system-message-id" }) },
      operatorSupplyRestriction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "restriction-id" }) },
    };
    const prisma = {
      courtSlot: { findFirst: vi.fn().mockResolvedValue(allocatedSlot) },
      $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
    } as unknown as Parameters<typeof reportCourtSupplyIncident>[0];

    const result = await reportCourtSupplyIncident(prisma, viewer, "slot-id", { code: "SCHEDULE_UNAVAILABLE", expectedVersion: 4 });

    expect(result).toMatchObject({ status: "WITHDRAWN", impact: "CANCEL_MATCH" });
    expect(transaction.courtSlot.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
    expect(transaction.match.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", cancellationReason: "COURT_SUPPLY_WITHDRAWN" }) }));
    expect(transaction.matchConversation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "READ_ONLY" }) }));
    expect(transaction.matchChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ conversationId: "conversation-id", type: "SYSTEM" }) }));
    expect(transaction.matchSupplyNoticeRecipient.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ recipientUserId: "host-user-id" }), expect.objectContaining({ recipientUserId: "pending-user-id" }), expect.objectContaining({ recipientUserId: "accepted-user-id" })]),
    }));
    expect(transaction.operatorSupplyRestriction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ operatorApplicationId: "application-id", source: "AUTOMATED" }),
    }));
  });
});
