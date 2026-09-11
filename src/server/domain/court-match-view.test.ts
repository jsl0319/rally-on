import { describe, expect, it, vi } from "vitest";

import { getCourtMatchParticipation, getOperatorCourtMatch } from "./court-match-view";

vi.mock("./court-match-service", () => ({ reconcileCourtMatch: vi.fn().mockResolvedValue({ expiredCount: 0, didCancel: false }) }));

const operatorId = "operator-user-id";
const applicantId = "applicant-user-id";

function application(overrides: Record<string, unknown> = {}) {
  return {
    receivedAmountKrw: null, lastReceivedAt: null, receiptVersion: 0, legacyRefundPaidKrw: 0, refundAccountVersion: 1, refundAmountKrw: null,
    receiptRecords: [], refundAttempts: [], confirmationDueAt: null,
    id: "application-id",
    applicantUserId: applicantId,
    applicantGender: "MALE",
    status: "ACCEPTED",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    message: "천천히 랠리하고 싶어요.",
    profileSnapshot: { experienceLabel: "1년 미만", rallyLevelLabel: "천천히 이어가요" },
    paymentDueAt: new Date("2030-01-01T06:00:00.000Z"),
    depositCode: "742",
    depositorName: null,
    depositClaimedAt: null,
    confirmedAt: null,
    refundBank: null,
    refundAccountNumber: null,
    refundAccountHolder: null,
    refundRequestedAt: null,
    refundCompletedAt: null,
    applicantUser: { nickname: "민지" },
    ...overrides,
  };
}

function courtMatch(overrides: Record<string, unknown> = {}, applications = [application()]) {
  return {
    id: "match-id",
    hostUserId: operatorId,
    host: { status: "ACTIVE" },
    courtSource: "PARTNER_COURT",
    courtSlotId: "slot-id",
    title: "마포 테니스파크",
    status: "OPEN",
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
    totalCourtFeeKrw: 24_000,
    recruitCount: 4,
    maleRecruitCount: null,
    femaleRecruitCount: null,
    cancellationReason: null,
    settlementBank: "테스트은행",
    settlementAccountNumber: "123-456-789",
    settlementAccountHolder: "마포테니스파크",
    conversation: null,
    applications,
    courtSlot: {
      id: "slot-id",
      status: "AVAILABLE",
      approvalMode: "OPERATOR",
      minParticipantCount: 2,
      courtUnit: { court: { name: "마포 테니스파크", operatorApplication: { applicantUserId: operatorId } } },
    },
    ...overrides,
  };
}

function prismaFor(match: unknown) {
  return { match: { findUnique: vi.fn().mockResolvedValue(match) } } as unknown as Parameters<typeof getOperatorCourtMatch>[0];
}

describe("운영자 코트 매칭 조회", () => {
  it("코트 매칭을 연 운영자만 조회할 수 있다", async () => {
    await expect(getOperatorCourtMatch(prismaFor(courtMatch()), { id: "someone-else" }, "match-id")).rejects.toMatchObject({
      code: "COURT_MATCH_OPERATOR_REQUIRED",
      status: 403,
    });
  });

  it("호스트여도 그 시설의 운영자가 아니면 막는다", async () => {
    // 옛 모델로 만들어진 기록은 모집자가 호스트다. 시설 운영자와 일치해야만 연다.
    const legacy = courtMatch({
      courtSlot: {
        id: "slot-id",
        status: "AVAILABLE",
        approvalMode: "AUTO",
        minParticipantCount: 2,
        courtUnit: { court: { name: "마포 테니스파크", operatorApplication: { applicantUserId: "another-operator" } } },
      },
    });

    await expect(getOperatorCourtMatch(prismaFor(legacy), { id: operatorId }, "match-id")).rejects.toMatchObject({
      code: "COURT_MATCH_OPERATOR_REQUIRED",
    });
  });

  it("직접 승인 방식에서만 프로필과 신청 메시지를 보여 준다", async () => {
    const result = await getOperatorCourtMatch(prismaFor(courtMatch()), { id: operatorId }, "match-id");

    expect(result.applications[0]).toMatchObject({
      nickname: "민지",
      gender: "MALE",
      message: "천천히 랠리하고 싶어요.",
      depositCode: "742",
    });
  });

  it("자동 승인 방식에서는 프로필과 신청 메시지를 내리지 않는다", async () => {
    // 자동 승인이면 사람이 판단할 일이 없으므로 입금 확인에 필요한 최소치만 준다(docs/03-2 §3.8).
    const autoMatch = courtMatch({
      courtSlot: {
        id: "slot-id",
        status: "AVAILABLE",
        approvalMode: "AUTO",
        minParticipantCount: 2,
        courtUnit: { court: { name: "마포 테니스파크", operatorApplication: { applicantUserId: operatorId } } },
      },
    });

    const result = await getOperatorCourtMatch(prismaFor(autoMatch), { id: operatorId }, "match-id");

    expect(result.applications[0]).not.toHaveProperty("message");
    expect(result.applications[0]).not.toHaveProperty("profileSnapshot");
    expect(result.applications[0]).toMatchObject({ nickname: "민지", depositCode: "742" });
  });

  it("일반 매칭은 코트 매칭 조회로 열 수 없다", async () => {
    await expect(getOperatorCourtMatch(prismaFor(courtMatch({ courtSource: "EXTERNAL_RESERVED" })), { id: operatorId }, "match-id")).rejects.toMatchObject({
      code: "MATCH_NOT_FOUND",
      status: 404,
    });
  });
});

const applicantViewer = { id: applicantId, profile: { gender: "MALE" as const } };

describe("참가자 코트 매칭 조회", () => {
  it("승인된 참가자에게만 입금 계좌를 보여 준다", async () => {
    const result = await getCourtMatchParticipation(prismaFor(courtMatch()), applicantViewer, "match-id");

    expect(result.settlementAccount).toMatchObject({ bank: "테스트은행", accountNumber: "123-456-789" });
  });

  it("아직 승인되지 않았으면 입금 계좌를 감춘다", async () => {
    const pending = courtMatch({}, [application({ status: "PENDING", depositCode: null, paymentDueAt: null })]);

    const result = await getCourtMatchParticipation(prismaFor(pending), applicantViewer, "match-id");

    expect(result.settlementAccount).toBeNull();
  });

  it("신청하지 않은 사람에게도 입금 계좌를 감춘다", async () => {
    const result = await getCourtMatchParticipation(prismaFor(courtMatch({}, [])), { id: "another-user", profile: { gender: "MALE" } }, "match-id");

    expect(result.settlementAccount).toBeNull();
    expect(result.application).toBeNull();
    expect(result.canApply).toBe(true);
  });

  it("이미 신청했으면 다시 신청할 수 없다", async () => {
    const result = await getCourtMatchParticipation(prismaFor(courtMatch()), applicantViewer, "match-id");

    expect(result.canApply).toBe(false);
    expect(result.blockedReason).toBe("이미 신청한 코트 매칭이에요.");
  });

  it("자리는 승인과 확정을 함께 센다", async () => {
    // 승인만 받고 입금 전인 자리도 차지한 것으로 봐야 초과 승인이 나지 않는다.
    const full = courtMatch({}, [
      application({ id: "a1", applicantUserId: "u1", status: "ACCEPTED" }),
      application({ id: "a2", applicantUserId: "u2", status: "CONFIRMED" }),
      application({ id: "a3", applicantUserId: "u3", status: "CONFIRMED" }),
      application({ id: "a4", applicantUserId: "u4", status: "ACCEPTED" }),
      application({ id: "a5", applicantUserId: "u5", status: "REJECTED" }),
    ]);

    const result = await getCourtMatchParticipation(prismaFor(full), { id: "new-user", profile: { gender: "MALE" } }, "match-id");

    expect(result.seatCount).toBe(4);
    expect(result.confirmedCount).toBe(2);
    expect(result.remainingSpots).toBe(0);
    expect(result.blockedReason).toBe("남은 자리가 없어요.");
  });
});
