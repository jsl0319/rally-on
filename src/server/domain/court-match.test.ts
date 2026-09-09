import { describe, expect, it, vi } from "vitest";

import {
  getApplicationDeadline,
  getJudgementAt,
  getPaymentDueAt,
  isAwaitingRefund,
} from "./court-match";
import { applyToCourtMatch } from "./court-match-service";

const startsAt = new Date("2030-01-02T10:00:00.000Z");

describe("코트 매칭 기한 계산", () => {
  it("판정 시점은 시작 3시간 전, 신청 마감은 시작 30분 전이다", () => {
    expect(getJudgementAt(startsAt).toISOString()).toBe("2030-01-02T07:00:00.000Z");
    expect(getApplicationDeadline(startsAt).toISOString()).toBe("2030-01-02T09:30:00.000Z");
  });

  it("여유가 있으면 승인 6시간 뒤를 입금 기한으로 준다", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    expect(getPaymentDueAt(now, startsAt).toISOString()).toBe("2030-01-01T06:00:00.000Z");
  });

  it("6시간이 판정 시점을 넘으면 판정 시점으로 자른다", () => {
    // 최소 인원을 입금 완료 인원으로 세므로, 기한이 판정보다 늦으면 자리는 찼는데
    // 돈은 안 낸 상태로 판정을 맞게 된다.
    const now = new Date("2030-01-02T05:00:00.000Z");
    expect(getPaymentDueAt(now, startsAt).toISOString()).toBe("2030-01-02T07:00:00.000Z");
  });

  it("판정 시점이 지난 뒤의 신청은 시작 30분 전까지만 준다", () => {
    const now = new Date("2030-01-02T08:00:00.000Z");
    expect(getPaymentDueAt(now, startsAt).toISOString()).toBe("2030-01-02T09:30:00.000Z");
  });

  it("입금까지 마친 신청이 취소되고 아직 환불 표시가 없으면 환불 대기다", () => {
    const confirmedAt = new Date("2030-01-01T00:00:00.000Z");
    expect(isAwaitingRefund({ status: "CANCELLED", confirmedAt, refundCompletedAt: null })).toBe(true);
    expect(isAwaitingRefund({ status: "CANCELLED", confirmedAt, refundCompletedAt: new Date() })).toBe(false);
    // 입금 전에 취소된 신청은 돌려줄 것이 없다.
    expect(isAwaitingRefund({ status: "CANCELLED", confirmedAt: null, refundCompletedAt: null })).toBe(false);
    expect(isAwaitingRefund({ status: "EXPIRED_UNPAID", confirmedAt: null, refundCompletedAt: null })).toBe(false);
  });
});

// 운영자 승인 방식이면 신청 당시 프로필 스냅샷을 남기므로, 프로필 전체가 있어야 한다.
type Viewer = Parameters<typeof applyToCourtMatch>[1];
const viewer = {
  id: "applicant-user-id",
  profile: {
    gender: "MALE",
    experienceRange: "MONTHS_6_TO_12",
    rallyLevel: "SHORT_RALLY",
    gameExperience: "KNOWS_RULES",
    purposes: [{ purpose: "RALLY_PRACTICE" }],
    version: 1,
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
  },
} as unknown as Viewer;

function courtMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-id",
    hostUserId: "operator-user-id",
    title: "마포 테니스파크 2번 코트",
    status: "OPEN",
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    courtSource: "PARTNER_COURT",
    recruitCount: 4,
    maleRecruitCount: null,
    femaleRecruitCount: null,
    courtSlot: {
      id: "slot-id",
      status: "AVAILABLE",
      approvalMode: "AUTO",
      minParticipantCount: 2,
      // 서비스는 이 코트 매칭이 실제로 그 시설 운영자의 것인지 다시 확인한다.
      courtUnit: { court: { status: "ACTIVE", operatorApplication: { applicantUserId: "operator-user-id", status: "PUBLISH_APPROVED" } } },
    },
    ...overrides,
  };
}

function transactionFor(match: ReturnType<typeof courtMatch>, seatCount: number) {
  return {
    // 동시 신청을 막기 위해 Match 행을 잠근 뒤 읽는다.
    $queryRaw: vi.fn().mockResolvedValue([{ id: "match-id" }]),
    match: { findUnique: vi.fn().mockResolvedValue(match), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    matchApplication: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(seatCount),
      create: vi.fn().mockResolvedValue({ id: "application-id" }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ matchNotificationsEnabled: true }) },
    notification: { create: vi.fn() },
  };
}

function prismaFor(transaction: ReturnType<typeof transactionFor>) {
  return {
    $transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as Parameters<typeof applyToCourtMatch>[0];
}

describe("코트 매칭 참가 신청", () => {
  it("자동 승인이면 바로 자리를 잡고 입금 코드와 기한을 발급한다", async () => {
    const transaction = transactionFor(courtMatch(), 1);

    await expect(applyToCourtMatch(prismaFor(transaction), viewer, "match-id")).resolves.toMatchObject({
      status: "ACCEPTED",
      depositCode: expect.stringMatching(/^\d{3}$/),
    });
    expect(transaction.matchApplication.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACCEPTED" }),
    }));
  });

  it("운영자 승인 방식이면 검토 대기로 남기고 운영자에게 알린다", async () => {
    const transaction = transactionFor(courtMatch({ courtSlot: { ...courtMatch().courtSlot, approvalMode: "OPERATOR" } }), 1);

    await expect(applyToCourtMatch(prismaFor(transaction), viewer, "match-id")).resolves.toMatchObject({
      status: "PENDING",
      depositCode: null,
    });
    expect(transaction.matchApplication.update).not.toHaveBeenCalled();
    expect(transaction.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "operator-user-id", type: "APPLICATION_RECEIVED" }),
    }));
  });

  it("승인만 받고 입금하지 않은 자리도 정원에 포함한다", async () => {
    // 자리는 ACCEPTED + CONFIRMED가 차지한다. ACCEPTED만 셌다면 초과 승인이 난다.
    const transaction = transactionFor(courtMatch(), 4);

    await expect(applyToCourtMatch(prismaFor(transaction), viewer, "match-id")).rejects.toMatchObject({
      code: "NO_REMAINING_SPOTS",
      status: 409,
    });
    expect(transaction.matchApplication.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["ACCEPTED", "CONFIRMED"] } }),
    }));
  });

  it("시작 30분 전이 지나면 신청을 받지 않는다", async () => {
    // 최소 인원을 채운 매칭도 시작 30분 전에는 추가 신청이 마감된다.
    const transaction = transactionFor(courtMatch({ startsAt: new Date(Date.now() + 10 * 60 * 1000) }), 2);

    await expect(applyToCourtMatch(prismaFor(transaction), viewer, "match-id")).rejects.toMatchObject({
      code: "COURT_MATCH_APPLICATION_CLOSED",
      status: 409,
    });
  });

  it("운영자 자신은 자기 코트 매칭에 신청할 수 없다", async () => {
    const transaction = transactionFor(courtMatch(), 0);

    await expect(applyToCourtMatch(prismaFor(transaction), { ...viewer, id: "operator-user-id" }, "match-id")).rejects.toMatchObject({
      code: "OWN_MATCH_APPLICATION_NOT_ALLOWED",
    });
  });

  it("일반 매칭에는 코트 매칭 신청 경로를 쓸 수 없다", async () => {
    const transaction = transactionFor(courtMatch({ courtSource: "EXTERNAL_RESERVED" }), 0);

    await expect(applyToCourtMatch(prismaFor(transaction), viewer, "match-id")).rejects.toMatchObject({
      code: "NOT_A_COURT_MATCH",
    });
  });
});
