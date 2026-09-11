import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "./profile-service";
import { lockAccountTransactions } from "./account-transaction-lock";
import { makeConversationReadOnly } from "./match-chat-service";
import { recordApplicationNotification } from "./notification-service";

export const handoffInputSchema = z.object({ expectedVersion: z.number().int().nonnegative(), clientRequestId: z.uuid(), note: z.string().trim().min(10).max(450) });
export async function assertHandoffAccess(tx: Prisma.TransactionClient | PrismaClient, actorId: string, matchId: string, requireAssigned = true) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { status: true, role: true } });
  if (actor?.status !== "ACTIVE" || actor.role !== "INTERNAL_REVIEWER") throw new DomainError("FORBIDDEN", 403, "활성 내부 담당자만 처리할 수 있어요.");
  const match = await tx.match.findUnique({ where: { id: matchId }, include: { host: { select: { status: true } }, transactionHandoff: { include: { assignee: { select: { status: true, role: true } } } } } });
  if (!match || match.courtSource !== "PARTNER_COURT" || match.host.status === "ACTIVE") throw new DomainError("HANDOFF_NOT_REQUIRED", 409, "비활성 운영자의 코트 거래만 인계할 수 있어요.");
  if (match.hostUserId === actorId || await tx.matchApplication.count({ where: { matchId, applicantUserId: actorId } })) throw new DomainError("SELF_REVIEW_NOT_ALLOWED", 403, "본인 거래는 다른 담당자에게 맡겨 주세요.");
  if (requireAssigned && match.transactionHandoff?.assigneeUserId !== actorId) throw new DomainError("HANDOFF_REQUIRED", 403, "먼저 이 거래의 인계를 맡아 주세요.");
  return match;
}
export async function listCourtHandoffs(prisma: PrismaClient, actorId: string, cursor?: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { status: true, role: true } });
  if (actor?.status !== "ACTIVE" || actor.role !== "INTERNAL_REVIEWER") throw new DomainError("FORBIDDEN", 403, "내부 담당자만 조회할 수 있어요.");
  const matches = await prisma.match.findMany({ where: { courtSource: "PARTNER_COURT", host: { status: { not: "ACTIVE" } }, hostUserId: { not: actorId }, applications: { none: { applicantUserId: actorId } } }, select: { id: true, title: true, startsAt: true, status: true, hostUserId: true, transactionHandoff: { include: { assignee: { select: { status: true, role: true } }, events: { orderBy: { createdAt: "asc" } } } } }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  return { items: matches.slice(0,50).map((m) => ({ id: m.id, title: m.title, startsAt: m.startsAt.toISOString(), status: m.status, originalOperatorId: m.hostUserId, version: m.transactionHandoff?.version ?? 0, assignedToMe: m.transactionHandoff?.assigneeUserId === actorId, canClaim: !m.transactionHandoff?.assigneeUserId || (m.transactionHandoff.assignee?.status !== "ACTIVE" || m.transactionHandoff.assignee.role !== "INTERNAL_REVIEWER"), events: m.transactionHandoff?.events.map((e) => ({ actorUserId: e.actorUserId, previousAssigneeUserId: e.previousAssigneeUserId, note: e.note, createdAt: e.createdAt.toISOString() })) ?? [] })), nextCursor: matches.length > 50 ? matches[49].id : null };
}
export type CourtHandoffQueue = Awaited<ReturnType<typeof listCourtHandoffs>>;
export async function claimCourtHandoff(prisma: PrismaClient, actorId: string, matchId: string, input: z.infer<typeof handoffInputSchema>) {
  return prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx);
    await tx.$queryRaw`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
    const m = await assertHandoffAccess(tx, actorId, matchId, false);
    const handoff = m.transactionHandoff;
    const existing = handoff ? await tx.courtTransactionHandoffEvent.findUnique({ where: { handoffId_clientRequestId: { handoffId: handoff.id, clientRequestId: input.clientRequestId } } }) : null;
    if (existing) {
      if (existing.actorUserId !== actorId || existing.note !== input.note) throw new DomainError("HANDOFF_CONFLICT", 409, "같은 요청 번호의 내용을 바꿀 수 없어요.");
      return { id: matchId };
    }
    if ((handoff?.version ?? 0) !== input.expectedVersion || (handoff?.assigneeUserId && handoff.assignee?.status === "ACTIVE" && handoff.assignee.role === "INTERNAL_REVIEWER")) throw new DomainError("HANDOFF_CONFLICT", 409, "담당 정보가 변경됐어요. 다시 확인해 주세요.");
    const next = await tx.courtTransactionHandoff.upsert({ where: { matchId }, create: { matchId, assigneeUserId: actorId }, update: { assigneeUserId: actorId, version: { increment: 1 } } });
    await tx.courtTransactionHandoffEvent.create({ data: { handoffId: next.id, actorUserId: actorId, previousAssigneeUserId: handoff?.assigneeUserId, clientRequestId: input.clientRequestId, note: input.note } });
    return { id: matchId };
  });
}
/** Internal operator-unavailability cancellation; prior voluntary cancellations retain their recorded basis. */
export async function cancelHandedOffCourtMatch(prisma: PrismaClient, actorId: string, matchId: string, input: z.infer<typeof handoffInputSchema>) {
  return prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx);
    await tx.$queryRaw`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
    const match = await assertHandoffAccess(tx, actorId, matchId);
    const handoff = match.transactionHandoff!;
    const existing = await tx.courtTransactionHandoffEvent.findUnique({ where: { handoffId_clientRequestId: { handoffId: handoff.id, clientRequestId: input.clientRequestId } } });
    const note = `경기 제공 불가 취소: ${input.note}`;
    if (existing) {
      if (existing.actorUserId !== actorId || existing.note !== note) throw new DomainError("HANDOFF_CONFLICT", 409, "요청 내용을 다시 확인해 주세요.");
      return { id: matchId };
    }
    const now = new Date();
    if (handoff.version !== input.expectedVersion || !["OPEN", "CLOSED"].includes(match.status) || now >= match.startsAt) throw new DomainError("HANDOFF_CONFLICT", 409, "이미 취소됐거나 시작된 경기예요. 최신 거래 상태를 확인해 주세요.");
    const affected = await tx.matchApplication.findMany({ where: { matchId, status: { in: ["PENDING", "ACCEPTED", "CONFIRMED"] } }, select: { id: true, applicantUserId: true } });
    await tx.match.update({ where: { id: matchId }, data: { status: "CANCELLED", cancelledAt: now, cancellationReason: "운영 중단으로 경기 제공 불가" } });
    await tx.matchApplication.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { status: "CANCELLED", cancelledAt: now, refundAmountKrw: null } });
    await makeConversationReadOnly(tx, matchId, "운영 중단으로 코트 매칭이 취소됐어요.", now);
    for (const a of affected) await recordApplicationNotification(tx, { recipientUserId: a.applicantUserId, type: "COURT_MATCH_CANCELLED", matchTitle: match.title, href: "/account/transactions" });
    await tx.courtTransactionHandoffEvent.create({ data: { handoffId: handoff.id, actorUserId: actorId, clientRequestId: input.clientRequestId, note } });
    await tx.courtTransactionHandoff.update({ where: { id: handoff.id }, data: { version: { increment: 1 } } });
    return { id: matchId };
  });
}
