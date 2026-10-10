import { describe, expect, it } from "vitest";
import { courtMoneyActions } from "./court-money-actions";

const base = {
  status: "CANCELLED", confirmedAt: new Date(), receivedAmountKrw: 12000, refundAmountKrw: null,
  legacyRefundPaidKrw: 0, refundAttempts: [], depositClaimedAt: null, receiptRecords: [],
  refundBank: null, refundAccountNumber: null, refundAccountHolder: null,
};
const account = { refundBank: "검증 은행", refundAccountNumber: "123456789", refundAccountHolder: "검증" };

describe("운영자 미처리 금전 업무", () => {
  it("전체 취소 후 계좌가 없어도 환불 대기 업무를 남긴다", () => {
    expect(courtMoneyActions(base, 12000)).toMatchObject({ refundAccountPending: 1, refundToComplete: 0 });
    expect(courtMoneyActions({ ...base, ...account }, 12000)).toMatchObject({ refundAccountPending: 0, refundToComplete: 1 });
  });
  it("입금 알림 후 만료·철회돼도 대조 전까지 표시하고, 대조 후에는 해제한다", () => {
    for (const status of ["EXPIRED_UNPAID", "WITHDRAWN", "REJECTED", "CANCELLED"]) {
      const a = { ...base, status, confirmedAt: null, receivedAmountKrw: null, depositClaimedAt: new Date("2030-01-01T01:00Z") };
      expect(courtMoneyActions(a, 12000).depositToReview).toBe(1);
      expect(courtMoneyActions({ ...a, receiptRecords: [{ createdAt: new Date("2030-01-01T02:00Z") }] }, 12000).depositToReview).toBe(0);
    }
  });
  it("입금 알림을 누르지 않아도 수령액을 기록한 승인 건은 확정을 기다린다", () => {
    expect(courtMoneyActions({ ...base, status: "ACCEPTED", confirmedAt: null }, 12000).depositToConfirm).toBe(1);
  });
  it("송금 진행·확인 필요·과다 송금을 환불 잔액과 별도로 표시한다", () => {
    expect(courtMoneyActions({ ...base, ...account, refundAttempts: [{ status: "PROCESSING", amountKrw: 12000 }] }, 12000)).toMatchObject({ refundProcessing: 1, refundToComplete: 0 });
    expect(courtMoneyActions({ ...base, refundAttempts: [{ status: "REVIEW", amountKrw: 12000 }] }, 12000).refundToReview).toBe(1);
    expect(courtMoneyActions({ ...base, refundAmountKrw: 0, refundAttempts: [{ status: "PAID", amountKrw: 12000 }] }, 12000).refundToReview).toBe(1);
  });
  it("정상 송금 완료·환불 0원은 계좌 입력을 요구하지 않는다", () => {
    expect(courtMoneyActions({ ...base, refundAmountKrw: 0 }, 12000).refundAccountPending).toBe(0);
    expect(courtMoneyActions({ ...base, refundAttempts: [{ status: "PAID", amountKrw: 12000 }] }, 12000)).toMatchObject({ refundAccountPending: 0, refundToComplete: 0, refundToReview: 0 });
  });
});
