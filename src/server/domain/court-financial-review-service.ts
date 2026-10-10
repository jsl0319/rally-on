import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { lockAccountTransactions, assertActiveTransactionUser } from "./account-transaction-lock";
import { assertHandoffAccess } from "./court-transaction-handoff";
import { lockApplicationMatch } from "./court-match-service";
import { DomainError } from "./profile-service";
import { courtMoneySummary } from "./court-match-money";
import { financialDigest, financialStateFingerprint, financialReviewInputSchema, type FinancialReviewInput } from "./court-financial-review";

const select = {
  id: true, applicantUserId: true, status: true, updatedAt: true, confirmedAt: true,
  depositClaimedAt: true, receiptVersion: true, refundAccountVersion: true, receivedAmountKrw: true,
  refundAmountKrw: true, agreedRefundAmountKrw: true, refundAgreementVersion: true, legacyRefundPaidKrw: true,
  receiptRecords: { select: { version: true, amountKrw: true, createdAt: true }, orderBy: { version: "desc" }, take: 1 },
  refundAttempts: { select: { id: true, version: true, status: true, amountKrw: true, updatedAt: true } },
  financialReviews: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  match: { select: { id: true, hostUserId: true, status: true, version: true, updatedAt: true, endsAt: true, courtSource: true, totalCourtFeeKrw: true,
    courtSlot: { select: { courtUnit: { select: { court: { select: { operatorApplication: { select: { applicantUserId: true } } } } } } } } } },
} satisfies Prisma.MatchApplicationSelect;
type Tx = Prisma.TransactionClient;
function conflict(message = "거래 상태가 바뀌었어요. 새로고침 후 다시 확인해 주세요.") {
  return new DomainError("FINANCIAL_REVIEW_CONFLICT", 409, message);
}

async function readState(tx: Tx, actorId: string, applicationId: string, handoff: boolean) {
  await lockAccountTransactions(tx);
  await lockApplicationMatch(tx, applicationId);
  await assertActiveTransactionUser(tx, actorId);
  const a = await tx.matchApplication.findUnique({ where: { id: applicationId }, select });
  if (!a || a.match.courtSource !== "PARTNER_COURT") throw new DomainError("APPLICATION_NOT_FOUND", 404, "코트 매칭 신청을 찾을 수 없어요.");
  if (handoff) await assertHandoffAccess(tx, actorId, a.match.id);
  else if (a.match.hostUserId !== actorId || a.match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== actorId) {
    throw new DomainError("FORBIDDEN", 403, "이 코트 매칭 운영자만 확인할 수 있어요.");
  }
  if (a.applicantUserId === actorId) throw new DomainError("SELF_REVIEW_NOT_ALLOWED", 403, "본인 신청은 직접 검토할 수 없어요.");
  const inquiries = await tx.supportInquiry.findMany({ where: { OR: [
    { applicationId }, { applicationId: null, matchId: a.match.id },
  ] }, select: { id: true, version: true, status: true, updatedAt: true } });
  const stateFingerprint = financialStateFingerprint({ ...a, inquiries });
  const expectedFingerprint = financialDigest({ stateFingerprint, reviews: a.financialReviews.map((r) => r.id).sort() });
  const latest = a.financialReviews.find((r) => r.action === "RECONCILE");
  const holds = a.financialReviews.filter((r) => r.action === "HOLD" && !a.financialReviews.some((release) => release.releasesReviewId === r.id));
  const money = courtMoneySummary(a, a.match.totalCourtFeeKrw ?? 0);
  const ended = ["WITHDRAWN", "REJECTED", "EXPIRED_UNPAID", "CANCELLED"].includes(a.status)
    || (a.status === "CONFIRMED" && !["CANCELLED", "EXPIRED"].includes(a.match.status) && a.match.endsAt <= new Date());
  const receipt = a.receiptRecords[0];
  const blockers: string[] = [];
  if (!ended) blockers.push("참가 업무가 아직 끝나지 않았어요.");
  if (a.receivedAmountKrw === null || !receipt || receipt.version !== a.receiptVersion || receipt.amountKrw !== a.receivedAmountKrw) blockers.push("누적 수령액을 은행 내역과 대조해 먼저 저장해 주세요. 미입금은 0원으로 기록해 주세요.");
  if (a.depositClaimedAt && (!receipt || receipt.createdAt < a.depositClaimedAt)) blockers.push("최근 입금 알림 이후의 수령 내역을 확인해 주세요.");
  if (a.match.totalCourtFeeKrw === null || [a.receivedAmountKrw, a.legacyRefundPaidKrw, a.refundAmountKrw, a.agreedRefundAmountKrw, ...a.refundAttempts.map((r) => r.amountKrw)].some((v) => v !== null && (!Number.isSafeInteger(v) || v < 0))) blockers.push("금전 기록을 먼저 확인해 주세요.");
  if (money.outstandingKrw || money.reservedKrw || money.needsReview || a.refundAttempts.some((r) => r.status === "PROCESSING" || r.status === "REVIEW")) blockers.push("반환 또는 송금 확인이 남아 있어요.");
  if (inquiries.some((i) => i.status !== "RESOLVED")) blockers.push("관련 문의를 먼저 해결해 주세요.");
  return { a, stateFingerprint, expectedFingerprint, latest, holds, blockers };
}

function view(state: Awaited<ReturnType<typeof readState>>) {
  const { expectedFingerprint, latest, stateFingerprint, holds, blockers } = state;
  return {
    expectedFingerprint, canReconcile: blockers.length === 0, blockers,
    reconciliation: latest ? { createdAt: latest.createdAt.toISOString(), current: latest.stateFingerprint === stateFingerprint && blockers.length === 0 } : null,
    holds: holds.map((h) => ({ id: h.id, scopes: h.scopes, reason: h.reason!, caseReference: h.caseReference!, reviewDueAt: h.reviewDueAt!.toISOString(), overdue: h.reviewDueAt! <= new Date() })),
    history: state.a.financialReviews.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt.toISOString(), reason: r.reason })),
  };
}
export type CourtFinancialReviewView = ReturnType<typeof view>;
export function getCourtFinancialReview(prisma: PrismaClient, actorId: string, applicationId: string, handoff = false) {
  return prisma.$transaction(async (tx) => view(await readState(tx, actorId, applicationId, handoff)));
}

export async function recordCourtFinancialReview(prisma: PrismaClient, actorId: string, applicationId: string, raw: FinancialReviewInput, handoff = false) {
  const input = financialReviewInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const state = await readState(tx, actorId, applicationId, handoff);
    const requestFingerprint = financialDigest(input);
    const existing = state.a.financialReviews.find((r) => r.clientRequestId === input.clientRequestId);
    if (existing) {
      if (existing.actorUserId !== actorId || existing.requestFingerprint !== requestFingerprint) throw conflict("같은 요청 번호로 내용을 바꿀 수 없어요.");
      return { id: existing.id };
    }
    if (input.expectedFingerprint !== state.expectedFingerprint) throw conflict();
    if (input.action === "RECONCILE" && state.blockers.length) throw conflict(state.blockers[0]);
    if (input.action === "HOLD" && new Date(input.reviewDueAt) <= new Date()) throw conflict("재검토일은 현재 이후로 정해 주세요.");
    if (input.action === "RELEASE_HOLD" && !state.holds.some((h) => h.id === input.holdId)) throw conflict("해당 신청에 아직 유효한 보존 기록이 없어요.");
    const record = await tx.courtFinancialReview.create({ data: {
      applicationId, actorUserId: actorId, clientRequestId: input.clientRequestId, action: input.action,
      requestFingerprint, stateFingerprint: state.stateFingerprint,
      scopes: input.action === "HOLD" ? input.scopes : [], reason: input.action !== "RECONCILE" ? input.reason : null,
      ...(input.action === "HOLD" ? { caseReference: input.caseReference, reviewDueAt: new Date(input.reviewDueAt) } : {}),
      ...(input.action === "RELEASE_HOLD" ? { releasesReviewId: input.holdId } : {}),
    } });
    return { id: record.id };
  });
}
