import type { PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import { assertActiveTransactionUser, lockAccountTransactions } from "./account-transaction-lock";
import { courtMatchSelect, lockCourtMatch, reconcileLockedCourtMatch } from "./court-match-service";
import { compositionCancellationInputSchema, courtLateReviewInputSchema, describeCourtComposition } from "./court-match-composition";
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
    await tx.matchApplication.updateMany({ where: { id: { in: affected.map((a) => a.id) }, status: { in: ["PENDING", "ACCEPTED", "CONFIRMED"] } }, data: { status: "CANCELLED", cancelledAt: now, refundAmountKrw: null } });
    await makeConversationReadOnly(tx, matchId, "경기 구성 부족으로 코트 매칭이 취소되어 읽기 전용이에요.", now);
    for (const a of affected) await recordApplicationNotification(tx, { recipientUserId: a.applicantUserId, type: "COURT_MATCH_CANCELLED", matchTitle: match.title, href: `/partner-sessions/${match.courtSlot!.id}` });
    return { id: matchId, status: "CANCELLED" as const };
  });
  if ("error" in result) throw result.error;
  return result;
}

/** A missed judgement is not evidence that a past game was unprovided. Record the operator's verification. */
export async function resolveCourtLateReview(prisma: PrismaClient, actor: { id: string }, matchId: string, input: z.infer<typeof courtLateReviewInputSchema>) {
  input = courtLateReviewInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx);
    await assertActiveTransactionUser(tx, actor.id);
    await lockCourtMatch(tx, matchId);
    const match = await tx.match.findUnique({ where: { id: matchId }, select: {
      ...courtMatchSelect, version: true, applications: { select: { id: true, applicantUserId: true, applicantGender: true, status: true } },
    } });
    if (!match || match.courtSource !== "PARTNER_COURT") throw new DomainError("MATCH_NOT_FOUND", 404, "코트 매칭을 찾을 수 없어요.");
    if (match.hostUserId !== actor.id || match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== actor.id) throw new DomainError("FORBIDDEN", 403, "이 경기를 연 운영자만 확인할 수 있어요.");
    const snapshot = match.courtCompositionSnapshot;
    const previous = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot.lateReview : null;
    if (previous && typeof previous === "object" && !Array.isArray(previous)) {
      if (previous.clientRequestId !== input.clientRequestId || previous.actorUserId !== actor.id || previous.outcome !== input.outcome || previous.note !== input.note) throw new DomainError("LATE_REVIEW_CONFLICT", 409, "이미 다른 확인 결과가 저장됐어요.");
      return { id: matchId, status: match.status };
    }
    const now = new Date();
    if (describeCourtComposition(match, now).phase !== "REVIEW_REQUIRED" || match.version !== input.expectedVersion) throw new DomainError("LATE_REVIEW_CONFLICT", 409, "경기 상태가 바뀌었어요. 다시 확인해 주세요.");
    if (input.outcome === "PROVIDED" && now < match.endsAt) throw new DomainError("MATCH_NOT_ENDED", 409, "일정 종료 후 실제 제공 완료를 기록해 주세요.");
    await reconcileLockedCourtMatch(tx, match, now);
    // Preserve any existing policy evidence; a manual review is not a backdated automatic pass.
    const evidence = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
    const status = input.outcome === "PROVIDED" ? "COMPLETED" : "CANCELLED";
    await tx.match.update({ where: { id: matchId }, data: {
      status, version: { increment: 1 },
      ...(status === "COMPLETED" ? { completedAt: now } : { cancelledAt: now, cancellationReason: "운영자가 실제 미제공을 확인해 취소했어요." }),
      courtCompositionSnapshot: { ...evidence, lateReview: { ...input, actorUserId: actor.id, reviewedAt: now.toISOString() } },
    } });
    if (status === "CANCELLED") {
      const affected = match.applications.filter((a) => ["PENDING", "ACCEPTED", "CONFIRMED"].includes(a.status));
      await tx.matchApplication.updateMany({ where: { id: { in: affected.map((a) => a.id) }, status: { in: ["PENDING", "ACCEPTED", "CONFIRMED"] } }, data: { status: "CANCELLED", cancelledAt: now, refundAmountKrw: null } });
      await makeConversationReadOnly(tx, matchId, "실제 미제공을 확인해 취소된 코트 매칭이에요.", now);
      for (const a of affected) await recordApplicationNotification(tx, { recipientUserId: a.applicantUserId, type: "COURT_MATCH_CANCELLED", matchTitle: match.title, href: `/partner-sessions/${match.courtSlot!.id}` });
    }
    return { id: matchId, status };
  });
}
