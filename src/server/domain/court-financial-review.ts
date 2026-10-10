import { createHash } from "node:crypto";
import { z } from "zod";

const base = { clientRequestId: z.uuid(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/) };
export const financialReviewInputSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("RECONCILE"), bankChecked: z.literal(true) }).strict(),
  z.object({ ...base, action: z.literal("HOLD"),
    scopes: z.array(z.enum(["DEPOSITOR_NAME", "REFUND_ACCOUNT", "REFUND_ATTEMPTS", "MATCH_ACCOUNT"])).min(1).max(4).refine((v) => new Set(v).size === v.length),
    reason: z.string().trim().min(10).max(500), caseReference: z.string().trim().min(2).max(100),
    reviewDueAt: z.iso.datetime({ offset: true }),
  }).strict(),
  z.object({ ...base, action: z.literal("RELEASE_HOLD"), holdId: z.uuid(), reason: z.string().trim().min(10).max(500) }).strict(),
]);
export type FinancialReviewInput = z.infer<typeof financialReviewInputSchema>;
type Stamp = Date | string;
type Versioned = { id: string; version: number; updatedAt: Stamp };
export type FinancialState = {
  id: string; status: string; updatedAt: Stamp; receiptVersion: number; refundAccountVersion: number; refundAgreementVersion?: number;
  match: Versioned & { status: string; endsAt: Stamp };
  refundAttempts: Versioned[];
  inquiries: Versioned[];
};
export function financialDigest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const timestamp = (value: Stamp) => new Date(value).toISOString();
const versions = (items: Versioned[]) => items.map((v) => [v.id, v.version, timestamp(v.updatedAt)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

/** Only record IDs, versions, states and timestamps, never account or message contents. */
export function financialStateFingerprint(a: FinancialState) {
  return financialDigest({ id: a.id, status: a.status, updatedAt: timestamp(a.updatedAt), receiptVersion: a.receiptVersion,
    refundAccountVersion: a.refundAccountVersion, match: [a.match.id, a.match.version, a.match.status, timestamp(a.match.endsAt), timestamp(a.match.updatedAt)],
    refunds: versions(a.refundAttempts), inquiries: versions(a.inquiries),
    ...(a.refundAgreementVersion ? { refundAgreementVersion: a.refundAgreementVersion } : {}) });
}
