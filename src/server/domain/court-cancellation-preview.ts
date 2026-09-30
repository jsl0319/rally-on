import { createHash } from "node:crypto";
import { z } from "zod";
import { getRefundAmountKrw, getRefundPercent } from "./court-match";
import { courtMoneySummary, type MoneyApplication } from "./court-match-money";

export const courtCancellationInputSchema = z.object({
  cancellationFingerprint: z.string().regex(/^[a-f0-9]{64}$/, "최신 취소 금액을 다시 확인해 주세요."),
});
export type CourtCancellationInput = z.infer<typeof courtCancellationInputSchema>;

type CancellationApplication = MoneyApplication & { id: string; depositClaimedAt: Date | null };
type CancellationMatch = { id: string; startsAt: Date; totalCourtFeeKrw: number | null };
const dayMs = 86400000;
const seoulOffsetMs = 9 * 3600000;

/** 조회와 실행에서 같은 조건을 비교한다. 발급 시각은 해시에 넣지 않는다. */
export function buildCourtCancellationPreview(application: CancellationApplication, match: CancellationMatch, now: Date) {
  const fee = match.totalCourtFeeKrw ?? 0;
  const confirmed = application.status === "CONFIRMED";
  const refundPercent = confirmed ? getRefundPercent(now, match.startsAt) : 0;
  const refundAmountKrw = confirmed ? getRefundAmountKrw(fee, now, match.startsAt) : null;
  const money = courtMoneySummary({ ...application, status: confirmed ? "CANCELLED" : "WITHDRAWN", refundAmountKrw }, fee);
  const startDay = Math.floor((match.startsAt.getTime() + seoulOffsetMs) / dayMs) * dayMs - seoulOffsetMs;
  const validUntil = confirmed && refundPercent > 0
    ? startDay - (refundPercent === 100 ? dayMs : 0)
    : match.startsAt.getTime();
  const preview = {
    policyVersion: "court-cancellation-2026-10-01-v1",
    applicationId: application.id, matchId: match.id, applicationStatus: application.status,
    startsAt: match.startsAt.toISOString(), feeKrw: fee,
    refundPercent, refundAmountKrw: money.outstandingKrw,
    receivedKrw: money.receivedKrw, paidKrw: money.paidKrw, reservedKrw: money.reservedKrw,
    paidBeforeConfirmation: application.status === "ACCEPTED" && application.depositClaimedAt !== null,
    validUntil: new Date(validUntil).toISOString(),
  };
  return { ...preview, fingerprint: createHash("sha256").update(JSON.stringify(preview)).digest("hex") };
}

export type CourtCancellationPreview = ReturnType<typeof buildCourtCancellationPreview>;
