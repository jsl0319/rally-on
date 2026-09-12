import type { PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import { assertActiveTransactionUser, lockAccountTransactions } from "./account-transaction-lock";
import { courtMatchSelect, lockCourtMatch, reconcileLockedCourtMatch } from "./court-match-service";
import { compositionCancellationInputSchema, describeCourtComposition } from "./court-match-composition";
import { makeConversationReadOnly } from "./match-chat-service";
import { recordApplicationNotification } from "./notification-service";
import { DomainError } from "./profile-service";

/** Cancels an unfulfillable future game, never sends funds or changes earlier voluntary refunds. */
export async function cancelCourtMatchForComposition(prisma: PrismaClient, actor: { id: string }, matchId: string, input: z.infer<typeof compositionCancellationInputSchema>) {
  const result = await prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx);
    await assertActiveTransactionUser(tx, actor.id);
    await lockCourtMatch(tx, matchId);
    const select = { ...courtMatchSelect, version: true, compositionCancellation: true, applications: { select: { id: true, applicantUserId: true, applicantGender: true, status: true } } } as const;
    let match = await tx.match.findUnique({ where: { id: matchId }, select });
    if (!match || match.courtSource !== "PARTNER_COURT") throw new DomainError("MATCH_NOT_FOUND", 404, "코트 매칭을 찾을 수 없어요.");
    if (match.hostUserId !== actor.id || match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== actor.id) throw new DomainError("FORBIDDEN", 403, "이 경기를 연 운영자만 취소할 수 있어요.");
    const existing = match.compositionCancellation;
    if (existing) {
      if (existing.clientRequestId !== input.clientRequestId || existing.actorUserId !== actor.id || existing.note !== input.note) throw new DomainError("COMPOSITION_CANCEL_CONFLICT", 409, "이미 다른 취소 요청이 처리됐어요.");
      return { id: matchId, status: "CANCELLED" as const };
    }
    const now = new Date();
    const reconciled = await reconcileLockedCourtMatch(tx, match, now);
    if (reconciled.didCancel) return { error: new DomainError("MATCH_CANCELLED", 409, "진행 조건 미달로 이미 취소됐어요. 최신 상태를 확인해 주세요.") };
    match = await tx.match.findUniqueOrThrow({ where: { id: matchId }, select });
    const composition = describeCourtComposition(match, now);
    if (!["OPEN", "CLOSED"].includes(match.status) || composition.phase !== "ACTION_REQUIRED" || match.version !== input.expectedVersion) throw new DomainError("COMPOSITION_CANCEL_CONFLICT", 409, "경기 구성이나 상태가 바뀌었어요. 최신 상태를 다시 확인해 주세요.");
    const affected = match.applications.filter((a) => ["PENDING", "ACCEPTED", "CONFIRMED"].includes(a.status));
    await tx.courtMatchCompositionCancellation.create({ data: {
      matchId, actorUserId: actor.id, clientRequestId: input.clientRequestId, note: input.note,
      compositionSnapshot: { policyVersion: match.courtCompositionPolicyVersion, passedAt: composition.passedAt, required: composition.required, counts: composition.counts },
      createdAt: now,
    } });
    await tx.match.update({ where: { id: matchId }, data: { status: "CANCELLED", cancelledAt: now, cancellationReason: "경기 구성 부족으로 코트 매칭이 취소됐어요.", version: { increment: 1 } } });
    await tx.matchApplication.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { status: "CANCELLED", cancelledAt: now, refundAmountKrw: null } });
    await makeConversationReadOnly(tx, matchId, "경기 구성 부족으로 코트 매칭이 취소되어 읽기 전용이에요.", now);
    for (const a of affected) await recordApplicationNotification(tx, { recipientUserId: a.applicantUserId, type: "COURT_MATCH_CANCELLED", matchTitle: match.title, href: `/partner-sessions/${match.courtSlot!.id}` });
    return { id: matchId, status: "CANCELLED" as const };
  });
  if ("error" in result) throw result.error;
  return result;
}
