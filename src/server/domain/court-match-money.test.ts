import { describe, expect, it } from "vitest";
import { courtMoneySummary, courtReceiptInputSchema, courtRefundResultInputSchema } from "./court-match-money";
import { canAcceptCourtApplication, getConfirmationDueAt, getPaymentDueAt } from "./court-match";
const base = { status: "ACCEPTED", confirmedAt: null, receivedAmountKrw: 12000, refundAmountKrw: null, legacyRefundPaidKrw: 0, refundAttempts: [] };

describe("입금과 반환 의무", () => {
  it.each(["WITHDRAWN", "EXPIRED_UNPAID", "CANCELLED", "REJECTED"])("미확정 %s의 실제 수령액은 전액 반환한다", (status) => {
    expect(courtMoneySummary({ ...base, status }, 12000)).toMatchObject({ refundTotalKrw: 12000, availableKrw: 12000 });
  });
  it("대기 중 부족 입금은 확정된 금액으로 간주하지 않지만 철회하면 모두 돌려준다", () => {
    expect(courtMoneySummary({ ...base, receivedAmountKrw: 5000 }, 12000).refundTotalKrw).toBe(0);
    expect(courtMoneySummary({ ...base, status: "WITHDRAWN", receivedAmountKrw: 5000 }, 12000).refundTotalKrw).toBe(5000);
  });
  it.each([0, 6000, 12000])("확정 취소 %i원과 초과분은 별도로 합산한다", (refundAmountKrw) => {
    expect(courtMoneySummary({ ...base, status: "CANCELLED", confirmedAt: new Date(), receivedAmountKrw: 15000, refundAmountKrw }, 12000).refundTotalKrw).toBe(refundAmountKrw + 3000);
  });
  it("이미 반환한 초과분은 취소 환불에서 다시 보내지 않는다", () => {
    expect(courtMoneySummary({ ...base, status: "CANCELLED", confirmedAt: new Date(), receivedAmountKrw: 15000, refundAmountKrw: 6000, refundAttempts: [{ status: "PAID", amountKrw: 3000 }] }, 12000).availableKrw).toBe(6000);
  });
  it("처리 중·확인 필요는 송금 예약액이고 실패만 재처리 가능하다", () => {
    for (const status of ["PROCESSING", "REVIEW"]) expect(courtMoneySummary({ ...base, status: "WITHDRAWN", refundAttempts: [{ status, amountKrw: 12000 }] }, 12000).availableKrw).toBe(0);
    expect(courtMoneySummary({ ...base, status: "WITHDRAWN", refundAttempts: [{ status: "FAILED", amountKrw: 12000 }] }, 12000).availableKrw).toBe(12000);
  });
  it("이전 환불 완료 금액을 보존하며 이후 추가 입금만 반환한다", () => {
    expect(courtMoneySummary({ ...base, status: "CANCELLED", confirmedAt: new Date(), legacyRefundPaidKrw: 12000, receivedAmountKrw: 15000 }, 12000)).toMatchObject({ paidKrw: 12000, availableKrw: 3000 });
  });
  it("실제 수령보다 이미 보낸 금액이 많아진 정정은 확인 필요다", () => {
    expect(courtMoneySummary({ ...base, status: "WITHDRAWN", receivedAmountKrw: 10000, legacyRefundPaidKrw: 12000 }, 12000).needsReview).toBe(true);
  });
  it("수령 시각 누락·음수·송금 완료 시각 누락을 거절한다", () => {
    const request = { clientRequestId: "10000000-0000-4000-8000-000000000001", expectedVersion: 0, note: "은행 대조" };
    expect(courtReceiptInputSchema.safeParse({ ...request, amountKrw: 5000, receivedAt: null }).success).toBe(false);
    expect(courtReceiptInputSchema.safeParse({ ...request, amountKrw: -1, receivedAt: null }).success).toBe(false);
    expect(courtRefundResultInputSchema.safeParse({ ...request, attemptId: request.clientRequestId, status: "PAID", transferredAt: null }).success).toBe(false);
  });
});

describe("이체와 확인 경계", () => {
  const starts = new Date("2030-01-02T10:00:00Z");
  it("판정 전 최소 이체 여유가 30분이고 1초라도 부족하면 승인하지 않는다", () => {
    expect(canAcceptCourtApplication(new Date("2030-01-02T06:00:00Z"), starts)).toBe(true);
    expect(canAcceptCourtApplication(new Date("2030-01-02T06:00:01Z"), starts)).toBe(false);
    expect(getConfirmationDueAt(getPaymentDueAt(new Date("2030-01-02T06:00:00Z"), starts)).toISOString()).toBe("2030-01-02T07:00:00.000Z");
  });
  it("판정 이후 신청은 90분 전 마감, 이체는 60분 전, 확인은 30분 전이다", () => {
    expect(canAcceptCourtApplication(new Date("2030-01-02T08:29:59Z"), starts)).toBe(true);
    expect(canAcceptCourtApplication(new Date("2030-01-02T08:30:00Z"), starts)).toBe(false);
    const due = getPaymentDueAt(new Date("2030-01-02T08:00:00Z"), starts);
    expect(due.toISOString()).toBe("2030-01-02T09:00:00.000Z");
    expect(getConfirmationDueAt(due).toISOString()).toBe("2030-01-02T09:30:00.000Z");
  });
});
