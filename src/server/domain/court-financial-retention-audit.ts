import { financialStateFingerprint, type FinancialState } from "./court-financial-review";
import type { Client } from "pg";
import {
  assessCourtFinancialRetention, courtFinancialServiceEnded, financialRetentionReasons,
  type FinancialRetentionApplication, type FinancialRetentionAssessment,
  type FinancialRetentionMatch, type FinancialRetentionReason,
} from "./court-financial-retention";

type MatchRow = FinancialRetentionMatch & {
  id: string;
  version: number;
  updatedAt: Date;
  hasRaw: boolean;
  hasOpenInquiry: boolean;
  hasResolvedInquiry: boolean;
};
type ApplicationRow = FinancialRetentionApplication & Omit<FinancialState, "match"> & {
  financialReviews: { id: string; action: string; stateFingerprint: string; releasesReviewId: string | null; scopes: string[]; reviewDueAt: string | null }[];
  matchId: string;
  hasRaw: boolean;
  refundRawCopies: number;
};

function emptyCounts() { return { records: 0, retain: 0, reviewRequired: 0 }; }
function countAssessment(counts: ReturnType<typeof emptyCounts>, assessment: FinancialRetentionAssessment) {
  counts.records += 1;
  if (assessment.status === "RETAIN") counts.retain += 1;
  else counts.reviewRequired += 1;
}

/**
 * Dedicated, connected pg Client only: this function owns its transaction.
 * No raw names/accounts, no state reconciliation, no mutations, and no public API.
 * All pages use one database snapshot; the report is not a deletion plan.
 */
export async function auditCourtFinancialRetention(client: Client) {
  const report = {
    mode: "READ_ONLY" as const,
    deletionEnabled: false as const,
    assessedAt: "",
    scanned: { matches: 0, applications: 0 },
    applicationsWithRaw: emptyCounts(),
    matchAccountsWithRaw: emptyCounts(),
    rawLocations: { applicationRecords: 0, refundAttemptRecords: 0, matchRecords: 0 },
    reasons: Object.entries(financialRetentionReasons).map(([code, description]) => ({
      code, description, applications: 0, matchAccounts: 0,
    })),
  };
  function countReasons(assessment: FinancialRetentionAssessment, scope: "applications" | "matchAccounts") {
    for (const reason of new Set(assessment.reasons)) report.reasons.find((item) => item.code === reason)![scope] += 1;
  }

  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    const { rows: [clock] } = await client.query<{ now: Date }>("SELECT CURRENT_TIMESTAMP AS now");
    const now = clock.now;
    report.assessedAt = now.toISOString();
    let cursor: string | null = null;
    while (true) {
      const { rows: matches }: { rows: MatchRow[] } = await client.query<MatchRow>(`
        SELECT m.id, m.version, m.updated_at AS "updatedAt", m.status, m.ends_at AS "endsAt", m.total_court_fee_krw AS fee,
          (m.settlement_account_number IS NOT NULL OR m.settlement_account_holder IS NOT NULL) AS "hasRaw",
          EXISTS (SELECT 1 FROM support_inquiries s WHERE s.match_id = m.id
            AND s.status <> 'RESOLVED') AS "hasOpenInquiry",
          EXISTS (SELECT 1 FROM support_inquiries s WHERE s.match_id = m.id
            AND s.status = 'RESOLVED') AS "hasResolvedInquiry"
        FROM matches m
        WHERE m.court_source = 'PARTNER_COURT' AND ($1::uuid IS NULL OR m.id > $1::uuid)
        ORDER BY m.id LIMIT 100`, [cursor]);
      if (matches.length === 0) break;

      const { rows: applications } = await client.query<ApplicationRow>(`
        SELECT a.id, a.updated_at AS "updatedAt", a.receipt_version AS "receiptVersion", a.refund_agreement_version AS "refundAgreementVersion", a.refund_account_version AS "refundAccountVersion", a.match_id AS "matchId", a.status, a.confirmed_at AS "confirmedAt",
          a.court_fee_krw AS "courtFeeKrw", a.brings_balls AS "bringsBalls", a.balls_missing_at AS "ballsMissingAt",
          a.received_amount_krw AS "receivedAmountKrw", a.refund_amount_krw AS "refundAmountKrw", a.agreed_refund_amount_krw AS "agreedRefundAmountKrw",
          a.legacy_refund_paid_krw AS "legacyRefundPaidKrw", a.deposit_claimed_at AS "depositClaimedAt",
          (a.deposit_code IS NOT NULL OR a.payment_due_at IS NOT NULL OR a.confirmation_due_at IS NOT NULL) AS "paymentInstructionsIssued",
          (a.depositor_name IS NOT NULL OR a.refund_account_number IS NOT NULL OR a.refund_account_holder IS NOT NULL) AS "hasRaw",
          EXISTS (SELECT 1 FROM court_receipt_records r WHERE r.application_id = a.id
            AND r.created_at >= a.deposit_claimed_at) AS "receiptRecordedAfterClaim",
          EXISTS (SELECT 1 FROM support_inquiries s WHERE
            (s.application_id = a.id OR (s.application_id IS NULL AND s.match_id = a.match_id AND s.user_id = a.applicant_user_id))
            AND s.status <> 'RESOLVED') AS "hasOpenInquiry",
          EXISTS (SELECT 1 FROM support_inquiries s WHERE
            (s.application_id = a.id OR (s.application_id IS NULL AND s.match_id = a.match_id AND s.user_id = a.applicant_user_id))
            AND s.status = 'RESOLVED') AS "hasResolvedInquiry",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'version', s.version, 'updatedAt', s.updated_at))
            FROM support_inquiries s WHERE s.application_id = a.id OR (s.application_id IS NULL AND s.match_id = a.match_id)), '[]'::jsonb) AS inquiries,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'action', r.action, 'stateFingerprint', r.state_fingerprint,
              'releasesReviewId', r.releases_review_id, 'scopes', r.scopes, 'reviewDueAt', r.review_due_at) ORDER BY r.created_at DESC, r.id DESC)
            FROM court_financial_reviews r WHERE r.application_id = a.id), '[]'::jsonb) AS "financialReviews",
          COALESCE(refunds.attempts, '[]'::jsonb) AS "refundAttempts",
          COALESCE(refunds.raw_copies, 0) AS "refundRawCopies"
        FROM match_applications a
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id', r.id, 'version', r.version, 'updatedAt', r.updated_at, 'amountKrw', r.amount_krw, 'status', r.status)) AS attempts,
            count(*) FILTER (WHERE r.account_number IS NOT NULL OR r.account_holder IS NOT NULL)::int AS raw_copies
          FROM court_refund_attempts r WHERE r.application_id = a.id
        ) refunds ON true
        WHERE a.match_id = ANY($1::uuid[])`, [matches.map((match) => match.id)]);

      for (const match of matches) {
        report.scanned.matches += 1;
        const matchReasons = new Set<FinancialRetentionReason>(["RETENTION_BASIS_UNASSESSED"]);
        let retainMatch = !courtFinancialServiceEnded(match, now);
        if (retainMatch) matchReasons.add("SERVICE_ACTIVE");
        if (match.hasOpenInquiry) { retainMatch = true; matchReasons.add("OPEN_INQUIRY"); }
        if (match.hasResolvedInquiry) matchReasons.add("INQUIRY_HISTORY_REVIEW");

        for (const application of applications.filter((row) => row.matchId === match.id)) {
          report.scanned.applications += 1;
          const latest = application.financialReviews.find((r) => r.action === "RECONCILE");
          const fingerprint = financialStateFingerprint({ ...application, match });
          application.reconciliation = latest ? latest.stateFingerprint === fingerprint ? "CURRENT" : "STALE" : undefined;
          const holds = application.financialReviews.filter((r) => r.action === "HOLD"
            && !application.financialReviews.some((release) => release.releasesReviewId === r.id));
          const assessment = assessCourtFinancialRetention(application, match, now);
          // Even a participant without stored raw values can still need the shared receiving account.
          if (assessment.status === "RETAIN") retainMatch = true;
          assessment.reasons.forEach((reason) => matchReasons.add(reason));
          const matchHolds = holds.filter((h) => h.scopes.includes("MATCH_ACCOUNT"));
          if (matchHolds.length) {
            retainMatch = true; matchReasons.add("PRESERVATION_HOLD");
            if (matchHolds.some((h) => h.reviewDueAt && new Date(h.reviewDueAt) <= now)) matchReasons.add("PRESERVATION_REVIEW_OVERDUE");
          }
          const applicationHolds = holds.filter((h) => h.scopes.some((scope) => scope !== "MATCH_ACCOUNT"));
          if (applicationHolds.length) {
            assessment.status = "RETAIN"; assessment.reasons.push("PRESERVATION_HOLD");
            if (applicationHolds.some((h) => h.reviewDueAt && new Date(h.reviewDueAt) <= now)) assessment.reasons.push("PRESERVATION_REVIEW_OVERDUE");
          }
          if (application.hasRaw) report.rawLocations.applicationRecords += 1;
          report.rawLocations.refundAttemptRecords += application.refundRawCopies;
          if (application.hasRaw || application.refundRawCopies > 0) {
            countAssessment(report.applicationsWithRaw, assessment);
            countReasons(assessment, "applications");
          }
        }
        if (match.hasRaw) {
          report.rawLocations.matchRecords += 1;
          const assessment: FinancialRetentionAssessment = {
            status: retainMatch ? "RETAIN" : "REVIEW_REQUIRED", reasons: [...matchReasons],
          };
          countAssessment(report.matchAccountsWithRaw, assessment);
          countReasons(assessment, "matchAccounts");
        }
      }
      cursor = matches.at(-1)!.id;
    }
    // Rollback also on success: no commit or state changes are part of this audit.
    await client.query("ROLLBACK");
    return report;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
