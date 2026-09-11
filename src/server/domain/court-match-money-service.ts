import { lockAccountTransactions, assertActiveTransactionUser } from "./account-transaction-lock";
import { assertHandoffAccess } from "./court-transaction-handoff";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import { lockApplicationMatch, reconcileCourtMatch } from "./court-match-service";
import { DomainError } from "./profile-service";
import { courtMoneySummary, type courtReceiptInputSchema, type courtRefundStartInputSchema, type courtRefundResultInputSchema } from "./court-match-money";
import type { RefundAccountInput } from "./court-match";
import { recordApplicationNotification } from "./notification-service";

const include = {
  refundAttempts: { orderBy: { createdAt: "desc" } },
  match: { select: { id: true, hostUserId: true, courtSource: true, totalCourtFeeKrw: true, title: true,
    courtSlot: { select: { courtUnit: { select: { court: { select: { operatorApplication: { select: { applicantUserId: true } } } } } } } } } },
} satisfies Prisma.MatchApplicationInclude;

async function readLocked(tx: Prisma.TransactionClient, applicationId: string) {
  await lockAccountTransactions(tx);
  await lockApplicationMatch(tx, applicationId);
  const a = await tx.matchApplication.findUnique({ where: { id: applicationId }, include });
  if (!a) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
  if (a.match.courtSource !== "PARTNER_COURT") throw new DomainError("NOT_A_COURT_MATCH", 409, "코트 매칭 신청만 처리할 수 있어요.");
  return a;
}
async function assertOperator(tx: Prisma.TransactionClient, a: Awaited<ReturnType<typeof readLocked>>, id: string, handoff: boolean) {
  if (handoff) { await assertHandoffAccess(tx, id, a.match.id); return; }
  await assertActiveTransactionUser(tx, id);
  if (a.match.hostUserId !== id || a.match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== id) {
    throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭의 운영자만 처리할 수 있어요.");
  }
}
function conflict(message = "다른 처리가 반영됐어요. 새로고침 후 확인해 주세요."): never { throw new DomainError("MONEY_STATE_CONFLICT", 409, message); }
function assertIdle(a: Awaited<ReturnType<typeof readLocked>>) {
  if (a.refundAttempts.some((r) => ["PROCESSING", "REVIEW"].includes(r.status))) conflict("송금 처리 중이거나 확인이 필요한 건이 있어요. 은행 대조 후 먼저 결과를 기록해 주세요.");
}
async function reconcile(prisma: PrismaClient, applicationId: string) {
  const a = await prisma.matchApplication.findUnique({ where: { id: applicationId }, select: { matchId: true } });
  if (a) await reconcileCourtMatch(prisma, a.matchId);
}

/** 종료 상태에도 수령 기록을 추가한다. 누적 금액이므로 동일 입금을 여러 번 더하지 않는다. */
export async function recordCourtReceipt(prisma: PrismaClient, operator: { id: string }, applicationId: string, input: z.infer<typeof courtReceiptInputSchema>, handoff = false) {
  await reconcile(prisma, applicationId);
  return prisma.$transaction(async (tx) => {
    const a = await readLocked(tx, applicationId); await assertOperator(tx, a, operator.id, handoff);
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : null;
    // 참가비 충족 시각을 별도로 기록해 이후 초과 입금이 정시 입금을 무효화하지 않게 한다.
    const feeReceivedAt = receivedAt && input.amountKrw >= (a.match.totalCourtFeeKrw ?? 0)
      ? new Date(input.feeReceivedAt ?? input.receivedAt!) : null;
    const existing = await tx.courtReceiptRecord.findUnique({ where: { applicationId_clientRequestId: { applicationId, clientRequestId: input.clientRequestId } } });
    if (existing) {
      const sameReceipt = existing.actorUserId === operator.id && existing.amountKrw === input.amountKrw
        && existing.receivedAt?.getTime() === receivedAt?.getTime()
        && existing.feeReceivedAt?.getTime() === feeReceivedAt?.getTime() && existing.note === input.note;
      if (!sameReceipt) conflict("같은 요청 번호로 다른 입금 기록을 저장할 수 없어요.");
      return { id: existing.id };
    }
    assertIdle(a);
    if (a.receiptVersion !== input.expectedVersion) conflict();
    if (receivedAt && receivedAt > new Date()) conflict("수령 시각은 미래일 수 없어요.");
    if (feeReceivedAt && (!receivedAt || feeReceivedAt > receivedAt)) conflict("참가비 충족 시각은 마지막 수령 시각보다 늦을 수 없어요.");
    const record = await tx.courtReceiptRecord.create({ data: {
      applicationId, actorUserId: operator.id, clientRequestId: input.clientRequestId,
      version: a.receiptVersion + 1, previousAmountKrw: a.receivedAmountKrw ?? (a.confirmedAt ? a.match.totalCourtFeeKrw ?? 0 : 0),
      amountKrw: input.amountKrw, receivedAt, feeReceivedAt, note: input.note,
    } });
    await tx.matchApplication.update({ where: { id: applicationId }, data: { receivedAmountKrw: input.amountKrw, lastReceivedAt: receivedAt, feeReceivedAt, receiptVersion: { increment: 1 } } });
    return { id: record.id };
  });
}

export async function submitCourtMatchRefundAccount(prisma: PrismaClient, viewer: { id: string }, applicationId: string, input: RefundAccountInput) {
  await reconcile(prisma, applicationId);
  return prisma.$transaction(async (tx) => {
    const a = await readLocked(tx, applicationId);
    if (a.applicantUserId !== viewer.id) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    assertIdle(a);
    if (courtMoneySummary(a, a.match.totalCourtFeeKrw ?? 0).outstandingKrw === 0) conflict("현재 반환할 금액이 없어요. 아직 확인되지 않은 입금은 문의해 주세요.");
    await tx.matchApplication.update({ where: { id: applicationId }, data: {
      refundBank: input.bank, refundAccountNumber: input.accountNumber, refundAccountHolder: input.accountHolder,
      refundAccountVersion: { increment: 1 }, refundRequestedAt: new Date(),
    } });
    return { id: applicationId };
  });
}

export async function startCourtRefund(prisma: PrismaClient, operator: { id: string }, applicationId: string, input: z.infer<typeof courtRefundStartInputSchema>, handoff = false) {
  await reconcile(prisma, applicationId);
  return prisma.$transaction(async (tx) => {
    const a = await readLocked(tx, applicationId); await assertOperator(tx, a, operator.id, handoff);
    const existing = a.refundAttempts.find((r) => r.clientRequestId === input.clientRequestId);
    if (existing) {
      if (existing.actorUserId !== operator.id || existing.amountKrw !== input.amountKrw || existing.accountVersion !== input.accountVersion) conflict();
      return { id: existing.id };
    }
    assertIdle(a);
    const money = courtMoneySummary(a, a.match.totalCourtFeeKrw ?? 0);
    if (money.needsReview || !money.availableKrw || money.availableKrw !== input.amountKrw || a.refundAccountVersion !== input.accountVersion) conflict("환불 금액 또는 계좌가 바뀌었어요. 최신 내용을 확인해 주세요.");
    if (!a.refundBank || !a.refundAccountNumber || !a.refundAccountHolder) conflict("참가자가 환불 계좌를 입력한 뒤 처리해 주세요.");
    const attempt = await tx.courtRefundAttempt.create({ data: {
      applicationId, actorUserId: operator.id, clientRequestId: input.clientRequestId, amountKrw: money.availableKrw,
      bank: a.refundBank, accountNumber: a.refundAccountNumber, accountHolder: a.refundAccountHolder, accountVersion: a.refundAccountVersion,
      events: { create: { actorUserId: operator.id, clientRequestId: input.clientRequestId, status: "PROCESSING", note: "금액과 계좌를 고정하고 송금 처리 시작" } },
    } });
    return { id: attempt.id };
  });
}

export async function completeCourtMatchRefund(prisma: PrismaClient, operator: { id: string }, applicationId: string, input: z.infer<typeof courtRefundResultInputSchema>, handoff = false) {
  return prisma.$transaction(async (tx) => {
    const a = await readLocked(tx, applicationId); await assertOperator(tx, a, operator.id, handoff);
    const attempt = a.refundAttempts.find((r) => r.id === input.attemptId);
    if (!attempt) throw new DomainError("REFUND_NOT_FOUND", 404, "환불 건을 찾을 수 없어요.");
    const existing = await tx.courtRefundEvent.findUnique({ where: { attemptId_clientRequestId: { attemptId: attempt.id, clientRequestId: input.clientRequestId } } });
    if (existing) {
      if (existing.actorUserId !== operator.id || existing.status !== input.status || existing.note !== input.note || (existing.transferredAt?.toISOString() ?? null) !== (input.transferredAt ? new Date(input.transferredAt).toISOString() : null)) conflict();
      return { id: attempt.id };
    }
    if (attempt.version !== input.expectedVersion) conflict();
    const valid = attempt.status === "PROCESSING" || attempt.status === "REVIEW"
      ? ["PAID", "FAILED"].includes(input.status) : attempt.status === "PAID" && input.status === "REVIEW";
    if (!valid) conflict("현재 환불 상태에서는 이 처리를 할 수 없어요.");
    // 완료 기록을 뒤집는 동안에도 다른 송금은 없어야 한다.
    if (a.refundAttempts.some((r) => r.id !== attempt.id && ["PROCESSING", "REVIEW"].includes(r.status))) conflict();
    const transferredAt = input.transferredAt ? new Date(input.transferredAt) : null;
    if (input.status === "PAID" && (!transferredAt || transferredAt > new Date() || transferredAt.getTime() < Math.floor(attempt.createdAt.getTime() / 1000) * 1000)) conflict("처리 시작 이후의 실제 송금 시각을 입력해 주세요.");
    await tx.courtRefundEvent.create({ data: { attemptId: attempt.id, actorUserId: operator.id, clientRequestId: input.clientRequestId, status: input.status, note: input.note, transferredAt } });
    await tx.courtRefundAttempt.update({ where: { id: attempt.id }, data: { status: input.status, transferredAt, version: { increment: 1 } } });
    const updated = a.refundAttempts.map((r) => r.id === attempt.id ? { ...r, status: input.status } : r);
    const money = courtMoneySummary({ ...a, refundAttempts: updated }, a.match.totalCourtFeeKrw ?? 0);
    await tx.matchApplication.update({ where: { id: applicationId }, data: { refundCompletedAt: input.status === "PAID" && !money.outstandingKrw && !money.reservedKrw ? new Date() : null } });
    if (input.status === "PAID") await recordApplicationNotification(tx, { recipientUserId: a.applicantUserId, type: "COURT_MATCH_REFUND_COMPLETED", matchTitle: a.match.title, href: "/activity/sent" });
    return { id: attempt.id };
  });
}
