import { describe, expect, it } from "vitest";
import { assessCourtFinancialRetention, type FinancialRetentionApplication } from "./court-financial-retention";

const now = new Date("2030-05-10T12:00:00Z");
const match = { status: "CLOSED", endsAt: new Date("2030-05-10T11:00:00Z"), fee: 12_000 };
function application(changes: Partial<FinancialRetentionApplication> = {}): FinancialRetentionApplication {
  return {
    status: "CANCELLED", confirmedAt: null, receivedAmountKrw: 12_000, refundAmountKrw: 12_000,
    legacyRefundPaidKrw: 0, refundAttempts: [{ status: "PAID", amountKrw: 12_000 }],
    paymentInstructionsIssued: true, depositClaimedAt: new Date("2030-05-09T12:00:00Z"),
    receiptRecordedAfterClaim: true, hasOpenInquiry: false, hasResolvedInquiry: false, ...changes,
  };
}
const assess = (changes: Partial<FinancialRetentionApplication> = {}) => assessCourtFinancialRetention(application(changes), match, now);

describe("금융 원문 정리 전 읽기 전용 판정", () => {
  it("전액 반환·수령 기록이 있어도 최종 대조와 보존 검토 없이 삭제 가능으로 분류하지 않는다", () => {
    expect(assess()).toEqual({ status: "REVIEW_REQUIRED", reasons: ["FINAL_RECONCILIATION_UNRECORDED", "RETENTION_BASIS_UNASSESSED"] });
  });
  it("계좌 안내 전 무입금 거절은 입금 대조 보류와 구분한다", () => {
    expect(assess({ status: "REJECTED", receivedAmountKrw: null, refundAmountKrw: null, refundAttempts: [],
      paymentInstructionsIssued: false, depositClaimedAt: null })).toEqual({
      status: "REVIEW_REQUIRED", reasons: ["RETENTION_BASIS_UNASSESSED"],
    });
  });
  it("계좌 안내 후 미입금 만료는 최종 대조 근거 확인이 필요하다", () => {
    expect(assess({ status: "EXPIRED_UNPAID", receivedAmountKrw: null, refundAttempts: [], depositClaimedAt: null }).reasons)
      .toContain("FINAL_RECONCILIATION_UNRECORDED");
  });
  it("새로운 입금 알림은 과거 수령·반환 완료보다 우선한다", () => {
    expect(assess({ receiptRecordedAfterClaim: false })).toMatchObject({ status: "RETAIN", reasons: expect.arrayContaining(["DEPOSIT_CHECK_REQUIRED"]) });
  });
  it.each(["PENDING", "ACCEPTED"])("끝난 경기의 %s는 읽기만 하고 상태 보정 필요를 보고한다", (status) => {
    expect(assess({ status })).toMatchObject({ status: "RETAIN", reasons: expect.arrayContaining(["APPLICATION_STATE_UNRECONCILED"]) });
  });
  it("미래 일정의 COMPLETED만으로 이용 종료를 인정하지 않는다", () => {
    const result = assessCourtFinancialRetention(application({ status: "CONFIRMED", refundAttempts: [] }),
      { ...match, status: "COMPLETED", endsAt: new Date(now.getTime() + 1) }, now);
    expect(result.reasons).toContain("SERVICE_ACTIVE");
  });
  it("일정 종료 경계와 미래 전체 취소는 구분해 이용 종료로 판단한다", () => {
    for (const endedMatch of [{ ...match, endsAt: now }, { ...match, status: "CANCELLED", endsAt: new Date(now.getTime() + 1) }]) {
      expect(assessCourtFinancialRetention(application({ status: "CONFIRMED", refundAttempts: [] }), endedMatch, now).reasons)
        .not.toContain("SERVICE_ACTIVE");
    }
  });
  it.each([0, 6_000])("부분 반환 %i원은 나머지 반환이 끝날 때까지 보존한다", (amountKrw) => {
    expect(assess({ refundAttempts: amountKrw ? [{ status: "PAID", amountKrw }] : [] }).reasons).toContain("REFUND_OUTSTANDING");
  });
  it.each(["PROCESSING", "REVIEW"])("잔액이 0이어도 %s 송금이 있으면 보존한다", (status) => {
    expect(assess({ refundAttempts: [{ status: "PAID", amountKrw: 12_000 }, { status, amountKrw: 1_000 }] }))
      .toMatchObject({ status: "RETAIN", reasons: expect.arrayContaining(["REFUND_IN_PROGRESS", "MONEY_REVIEW_REQUIRED"]) });
  });
  it("FAILED 이후 다른 시도의 전액 반환은 처리 중으로 세지 않는다", () => {
    expect(assess({ refundAttempts: [{ status: "FAILED", amountKrw: 12_000 }, { status: "PAID", amountKrw: 12_000 }] }).status).toBe("REVIEW_REQUIRED");
  });
  it("초과·중복 입금의 초과분도 반환 의무에 포함한다", () => {
    expect(assess({ status: "CONFIRMED", confirmedAt: now, receivedAmountKrw: 25_000 }).reasons).toContain("REFUND_OUTSTANDING");
  });
  it("환불 0원 취소는 최종 대조 검토 대상으로만 분류한다", () => {
    expect(assess({ confirmedAt: now, refundAmountKrw: 0, refundAttempts: [] }).status).toBe("REVIEW_REQUIRED");
  });
  it("confirmedAt 추정 수령액과 이전 환불 금액을 실제 대조로 간주하지 않는다", () => {
    expect(assess({ confirmedAt: now, receivedAmountKrw: null, legacyRefundPaidKrw: 12_000, refundAttempts: [] }).reasons)
      .toContain("LEGACY_RECEIPT_UNVERIFIED");
  });
  it("진행 중 문의는 보류하고 해결된 문의도 증거 검토 필요로 남긴다", () => {
    expect(assess({ hasOpenInquiry: true }).status).toBe("RETAIN");
    expect(assess({ hasResolvedInquiry: true })).toMatchObject({ status: "REVIEW_REQUIRED", reasons: expect.arrayContaining(["INQUIRY_HISTORY_REVIEW"]) });
  });
  it("부정확한 금전 데이터는 0으로 보정해 통과시키지 않는다", () => {
    expect(assess({ receivedAmountKrw: -1 }).reasons).toContain("INVALID_MONEY_STATE");
    expect(assess({ refundAttempts: [{ status: "UNKNOWN", amountKrw: 1 }] }).reasons).toContain("INVALID_MONEY_STATE");
    expect(assessCourtFinancialRetention(application(), { ...match, fee: null }, now).reasons).toContain("INVALID_MONEY_STATE");
  });
});
