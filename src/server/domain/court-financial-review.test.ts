import { describe, expect, it } from "vitest";
import { financialReviewInputSchema, financialStateFingerprint, type FinancialState } from "./court-financial-review";

const base = { clientRequestId: "10000000-0000-4000-8000-000000000001", expectedFingerprint: "a".repeat(64) };
describe("금융 검토 입력과 거래 지문", () => {
  it("명시적 은행 확인과 유효한 중복 요청 키를 요구한다", () => {
    for (const input of [{ ...base, action: "RECONCILE" }, { ...base, action: "RECONCILE", bankChecked: false },
      { ...base, action: "RECONCILE", bankChecked: true, clientRequestId: "bad" },
      { ...base, action: "RECONCILE", bankChecked: true, expectedFingerprint: "bad" }]) {
      expect(financialReviewInputSchema.safeParse(input).success).toBe(false);
    }
  });
  it("보존 범위·근거·참조·재검토일을 빠짐없이 요구한다", () => {
    const hold = { ...base, action: "HOLD", scopes: ["REFUND_ACCOUNT"], reason: "분쟁 관련 대조 증거 보존", caseReference: "CASE-123", reviewDueAt: "2030-01-01T00:00:00Z" };
    expect(financialReviewInputSchema.safeParse(hold).success).toBe(true);
    for (const change of [{ scopes: [] }, { scopes: ["REFUND_ACCOUNT", "REFUND_ACCOUNT"] }, { scopes: ["EVERYTHING"] },
      { reason: "짧음" }, { caseReference: "" }, { reviewDueAt: "2030-01-01" }, { accountNumber: "unwanted" }]) {
      expect(financialReviewInputSchema.safeParse({ ...hold, ...change }).success).toBe(false);
    }
  });
  it("시각 표현·목록 순서는 같게 읽고 상태 변경은 탐지한다", () => {
    const stamp = "2026-10-10T03:00:00Z";
    const a: FinancialState = { id: "application", status: "WITHDRAWN", updatedAt: stamp, receiptVersion: 1, refundAccountVersion: 1,
      match: { id: "match", status: "COMPLETED", version: 1, endsAt: stamp, updatedAt: stamp },
      refundAttempts: [{ id: "b", version: 1, updatedAt: stamp }, { id: "a", version: 2, updatedAt: stamp }], inquiries: [] };
    expect(financialStateFingerprint(a)).toBe(financialStateFingerprint({ ...a, updatedAt: "2026-10-10T12:00:00+09:00", refundAttempts: a.refundAttempts.toReversed() }));
    expect(financialStateFingerprint(a)).not.toBe(financialStateFingerprint({ ...a, inquiries: [{ id: "new", version: 1, updatedAt: stamp }] }));
    expect(financialStateFingerprint(a)).not.toBe(financialStateFingerprint({ ...a, receiptVersion: 2 }));
    expect(financialStateFingerprint(a)).not.toBe(financialStateFingerprint({ ...a, refundAgreementVersion: 1 }));
    expect(financialStateFingerprint(a)).toBe(financialStateFingerprint({ ...a, refundAgreementVersion: 0 }));
  });
});
