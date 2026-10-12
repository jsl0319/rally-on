import { payableCourtFee, applicationCourtFee, type CourtFeeSnapshot } from "@/matches/court-fee";
import { z } from "zod";

export const courtMissingBallsInputSchema = z.object({
  clientRequestId: z.uuid(), expectedReceiptVersion: z.number().int().nonnegative(),
  note: z.string().trim().min(10).max(500), confirmed: z.literal(true),
}).strict();

const requestFields = { clientRequestId: z.uuid(), expectedVersion: z.number().int().nonnegative() };
export const courtReceiptInputSchema = z.object({
  ...requestFields,
  amountKrw: z.number().int().min(0).max(100_000_000),
  receivedAt: z.iso.datetime({ offset: true }).nullable(),
  feeReceivedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().min(2).max(500),
}).refine((v) => v.amountKrw === 0 || v.receivedAt !== null, { message: "실제 수령 시각을 입력해 주세요.", path: ["receivedAt"] });
export const courtRefundStartInputSchema = z.object({
  clientRequestId: z.uuid(), accountVersion: z.number().int().positive(), amountKrw: z.number().int().positive(),
});
export const courtRefundResultInputSchema = z.object({
  ...requestFields, attemptId: z.uuid(), status: z.enum(["PAID", "FAILED", "REVIEW"]),
  transferredAt: z.iso.datetime({ offset: true }).nullable(), note: z.string().trim().min(2).max(500),
}).refine((v) => v.status !== "PAID" || v.transferredAt !== null, { message: "은행에서 확인한 송금 시각을 입력해 주세요.", path: ["transferredAt"] });

export const courtRefundAgreementInputSchema = z.object({
  ...requestFields, expectedReceiptVersion: z.number().int().nonnegative(),
  amountKrw: z.number().int().positive().max(100_000_000),
  incidentAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().min(10).max(500),
  agreementConfirmed: z.literal(true),
}).strict();

export type MoneyApplication = CourtFeeSnapshot & {
  agreedRefundAmountKrw?: number;

  status: string; confirmedAt: Date | null; receivedAmountKrw: number | null; refundAmountKrw: number | null;
  legacyRefundPaidKrw: number; refundAttempts: { amountKrw: number; status: string }[];
};

/** 실제 수령, 계약상 반환 의무, 송금 기록을 구분한다. 취소 정책은 이미 저장된 금액을 사용한다. */
export function courtMoneySummary(a: MoneyApplication, fee: number) {
  const receivedKrw = a.receivedAmountKrw ?? (a.confirmedAt ? applicationCourtFee(a, fee) : 0);
  fee = payableCourtFee(a, fee);
  const excessKrw = Math.max(0, receivedKrw - fee);
  const terminated = ["WITHDRAWN", "REJECTED", "EXPIRED_UNPAID", "CANCELLED"].includes(a.status);
  const policyAmountKrw = terminated && a.confirmedAt ? (a.refundAmountKrw ?? fee) : 0;
  const refundTotalKrw = terminated && !a.confirmedAt ? receivedKrw
    : Math.min(receivedKrw, Math.max(policyAmountKrw, a.agreedRefundAmountKrw ?? 0) + excessKrw);
  const paidKrw = a.legacyRefundPaidKrw + a.refundAttempts.filter((r) => r.status === "PAID").reduce((n, r) => n + r.amountKrw, 0);
  const reservedKrw = a.refundAttempts.filter((r) => r.status === "PROCESSING" || r.status === "REVIEW").reduce((n, r) => n + r.amountKrw, 0);
  const outstandingKrw = Math.max(0, refundTotalKrw - paidKrw);
  const additionalDueKrw = a.ballsMissingAt && !terminated ? Math.max(0, fee - receivedKrw) : 0;
  return { additionalDueKrw, receivedKrw, excessKrw, refundTotalKrw, paidKrw, reservedKrw, outstandingKrw,
    availableKrw: Math.max(0, outstandingKrw - reservedKrw),
    needsReview: (a.agreedRefundAmountKrw ?? 0) > Math.min(fee, receivedKrw) || paidKrw + reservedKrw > refundTotalKrw || a.refundAttempts.some((r) => r.status === "REVIEW"),
  };
}
