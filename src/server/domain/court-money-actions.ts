import { courtMoneySummary, type MoneyApplication } from "./court-match-money";

export type CourtMoneyActions = {
  depositToConfirm: number;
  depositToReview: number;
  refundAccountPending: number;
  refundToComplete: number;
  refundProcessing: number;
  refundToReview: number;
};

export function emptyCourtMoneyActions(): CourtMoneyActions {
  return { depositToConfirm: 0, depositToReview: 0, refundAccountPending: 0, refundToComplete: 0, refundProcessing: 0, refundToReview: 0 };
}

/** 종료된 경기와 계좌 미입력도 처리할 돈이 남아 있으면 운영 목록에 유지한다. */
export function courtMoneyActions(application: MoneyApplication & {
  depositClaimedAt: Date | null;
  receiptRecords: { createdAt: Date }[];
  refundBank: string | null;
  refundAccountNumber: string | null;
  refundAccountHolder: string | null;
}, fee: number): CourtMoneyActions {
  const actions = emptyCourtMoneyActions();
  const money = courtMoneySummary(application, fee);
  const lastReconciledAt = application.receiptRecords[0]?.createdAt;
  const unreviewedClaim = application.depositClaimedAt !== null
    && (!lastReconciledAt || lastReconciledAt < application.depositClaimedAt);
  if (application.status === "ACCEPTED" && (application.depositClaimedAt || money.receivedKrw > 0)) actions.depositToConfirm = 1;
  else if (unreviewedClaim) actions.depositToReview = 1;

  if (money.needsReview) actions.refundToReview = 1;
  else if (money.reservedKrw > 0) actions.refundProcessing = 1;
  else if (money.outstandingKrw > 0) {
    if (application.refundBank && application.refundAccountNumber && application.refundAccountHolder) actions.refundToComplete = 1;
    else actions.refundAccountPending = 1;
  }
  return actions;
}
