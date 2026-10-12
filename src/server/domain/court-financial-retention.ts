import { courtMoneySummary, type MoneyApplication } from "./court-match-money";

export const financialRetentionReasons = {
  SERVICE_ACTIVE: "참가·경기 이용이 아직 끝나지 않음",
  APPLICATION_STATE_UNRECONCILED: "종료된 경기의 신청 상태 정리 필요",
  DEPOSIT_CHECK_REQUIRED: "입금 알림 이후 수령 기록 확인 필요",
  ADDITIONAL_PAYMENT_OUTSTANDING: "공 미지참 추가 입금 확인 필요",
  REFUND_OUTSTANDING: "아직 반환할 금액이 남음",
  REFUND_IN_PROGRESS: "송금 처리 또는 결과 재확인 중",
  MONEY_REVIEW_REQUIRED: "과다 반환 또는 금전 기록 재확인 필요",
  INVALID_MONEY_STATE: "금전 기록이 누락되었거나 유효하지 않음",
  OPEN_INQUIRY: "관련 문의가 해결되지 않음",
  INQUIRY_HISTORY_REVIEW: "해결된 문의의 증거 보존 범위 확인 필요",
  LEGACY_RECEIPT_UNVERIFIED: "과거 추정 수령액·환불에 대조 근거 확인 필요",
  FINAL_RECONCILIATION_UNRECORDED: "최종 은행 대조 완료 근거가 별도로 기록되지 않음",
  FINAL_RECONCILIATION_STALE: "최종 대조 후 거래·문의 상태가 변경됨",
  PRESERVATION_HOLD: "해당 원문에 보존 사유가 등록됨",
  PRESERVATION_REVIEW_OVERDUE: "보존 사유 재검토 기한 경과 · 보존 유지",
  RETENTION_BASIS_UNASSESSED: "원문별 보존 사유 검토가 기록되지 않음",
} as const;

export type FinancialRetentionReason = keyof typeof financialRetentionReasons;
export type FinancialRetentionAssessment = {
  status: "RETAIN" | "REVIEW_REQUIRED";
  reasons: FinancialRetentionReason[];
};
export type FinancialRetentionMatch = { status: string; endsAt: Date; fee: number | null };
export type FinancialRetentionApplication = MoneyApplication & {
  reconciliation?: "CURRENT" | "STALE";
  paymentInstructionsIssued: boolean;
  depositClaimedAt: Date | null;
  receiptRecordedAfterClaim: boolean;
  hasOpenInquiry: boolean;
  hasResolvedInquiry: boolean;
};

export function courtFinancialServiceEnded(match: FinancialRetentionMatch, now: Date) {
  return match.status === "CANCELLED" || match.status === "EXPIRED" || match.endsAt <= now;
}

/** Read-only triage. Missing retention/reconciliation evidence must never become deletion permission. */
export function assessCourtFinancialRetention(
  application: FinancialRetentionApplication,
  match: FinancialRetentionMatch,
  now: Date,
): FinancialRetentionAssessment {
  const reasons: FinancialRetentionReason[] = [];
  let retain = false;
  const block = (reason: FinancialRetentionReason) => { retain = true; reasons.push(reason); };
  const terminated = ["WITHDRAWN", "REJECTED", "EXPIRED_UNPAID", "CANCELLED"].includes(application.status);
  if (!terminated) {
    if (!courtFinancialServiceEnded(match, now)) block("SERVICE_ACTIVE");
    else if (application.status !== "CONFIRMED") block("APPLICATION_STATE_UNRECONCILED");
  }

  if (application.depositClaimedAt && !application.receiptRecordedAfterClaim) block("DEPOSIT_CHECK_REQUIRED");
  if (application.hasOpenInquiry) block("OPEN_INQUIRY");
  if (application.hasResolvedInquiry) reasons.push("INQUIRY_HISTORY_REVIEW");

  const validAmount = (value: number) => Number.isSafeInteger(value) && value >= 0;
  const amounts = [match.fee, application.legacyRefundPaidKrw,
    application.receivedAmountKrw ?? 0, application.refundAmountKrw ?? 0, application.agreedRefundAmountKrw ?? 0,
    ...application.refundAttempts.map((attempt) => attempt.amountKrw)];
  if (amounts.some((value) => value === null || !validAmount(value))
    || application.refundAttempts.some((attempt) => !["PAID", "FAILED", "PROCESSING", "REVIEW"].includes(attempt.status))) {
    block("INVALID_MONEY_STATE");
  } else {
    const money = courtMoneySummary(application, match.fee!);
    if (money.additionalDueKrw > 0) block("ADDITIONAL_PAYMENT_OUTSTANDING");
    if (money.outstandingKrw > 0) block("REFUND_OUTSTANDING");
    if (application.refundAttempts.some((attempt) => ["PROCESSING", "REVIEW"].includes(attempt.status))) block("REFUND_IN_PROGRESS");
    if (money.needsReview) block("MONEY_REVIEW_REQUIRED");
  }

  if (application.reconciliation !== "CURRENT" && ((application.confirmedAt && application.receivedAmountKrw === null) || application.legacyRefundPaidKrw > 0)) {
    reasons.push("LEGACY_RECEIPT_UNVERIFIED");
  }
  if (application.paymentInstructionsIssued || application.depositClaimedAt || application.confirmedAt
    || application.receivedAmountKrw !== null || application.refundAttempts.length > 0 || application.legacyRefundPaidKrw > 0) {
    // A receipt created after a claim, or a PAID refund, is not a final bank reconciliation attestation.
    if (application.reconciliation !== "CURRENT") reasons.push(application.reconciliation === "STALE" ? "FINAL_RECONCILIATION_STALE" : "FINAL_RECONCILIATION_UNRECORDED");
  }
  reasons.push("RETENTION_BASIS_UNASSESSED");
  return { status: retain ? "RETAIN" : "REVIEW_REQUIRED", reasons };
}
