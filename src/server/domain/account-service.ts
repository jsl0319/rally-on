import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, User } from "@/generated/prisma/client";
import { deleteStoredProfileImage } from "./profile-image-service";
import { DomainError } from "./profile-service";
import { lockAccountTransactions } from "./account-transaction-lock";
import { cancelCourtApplicationLocked, lockCourtMatch, reconcileLockedCourtMatch, courtMatchSelect } from "./court-match-service";
import { courtMoneySummary } from "./court-match-money";
import { getRefundAmountKrw } from "./court-match";

async function withdrawalState(tx: Prisma.TransactionClient, userId: string) {
  const matches = await tx.match.findMany({ where: { courtSource: "PARTNER_COURT", OR: [{ hostUserId: userId }, { applications: { some: { applicantUserId: userId } } }] }, orderBy: { id: "asc" }, select: courtMatchSelect });
  for (const match of matches) {
    await lockCourtMatch(tx, match.id);
    const current = await tx.match.findUnique({ where: { id: match.id }, select: courtMatchSelect });
    await reconcileLockedCourtMatch(tx, current, new Date());
  }
  const now = new Date();
  const applications = await tx.matchApplication.findMany({ where: { applicantUserId: userId, match: { courtSource: "PARTNER_COURT" } }, include: { refundAttempts: true, match: true }, orderBy: { id: "asc" } });
  const items = applications.map((a) => {
    const cancel = a.match.startsAt > now && a.match.status !== "CANCELLED" && ["PENDING", "ACCEPTED", "CONFIRMED"].includes(a.status);
    const refundAmountKrw = cancel && a.status === "CONFIRMED" ? getRefundAmountKrw(a.match.totalCourtFeeKrw ?? 0, now, a.match.startsAt) : a.refundAmountKrw;
    const money = courtMoneySummary({ ...a, ...(cancel ? { status: "CANCELLED", refundAmountKrw } : {}) }, a.match.totalCourtFeeKrw ?? 0);
    return { id: a.id, title: a.match.title, startsAt: a.match.startsAt.toISOString(), status: a.status, cancel, refundAmountKrw, money, awaitingReceipt: a.receivedAmountKrw === null, refundAccountMissing: !a.refundBank, receiptVersion: a.receiptVersion, refundAccountVersion: a.refundAccountVersion };
  });
  const hosted = matches.filter((m) => m.hostUserId === userId).map((m) => ({ id: m.id, title: m.title, startsAt: m.startsAt.toISOString() }));
  const assignedInquiryCount = await tx.supportInquiry.count({ where: { assigneeUserId: userId, status: { not: "RESOLVED" } } });
  const assignedCourtHandoffCount = await tx.courtTransactionHandoff.count({ where: { assigneeUserId: userId } });
  const data = { items, hosted, assignedInquiryCount, assignedCourtHandoffCount };
  return { ...data, evaluatedAt: now.toISOString(), token: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
}
export type WithdrawalPreview = Awaited<ReturnType<typeof withdrawalState>>;
export async function previewWithdrawal(prisma: PrismaClient, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx, true);
    return withdrawalState(tx, userId);
  }, { timeout: 20000 });
}
export async function withdrawAccount(prisma: PrismaClient, user: User, token: string) {
  const result = await prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx, true);
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (current.status === "WITHDRAWN") return { withdrawnAt: current.withdrawnAt!.toISOString() };
    if (current.status !== "ACTIVE") throw new DomainError("ACCOUNT_ALREADY_INACTIVE", 409, "이미 처리된 계정이에요.");
    const preview = await withdrawalState(tx, user.id);
    if (preview.token !== token) return { changed: true as const };
    // One decision instant also covers the KST midnight refund boundary.
    const now = new Date(preview.evaluatedAt);
    for (const a of preview.items.filter((a) => a.cancel)) await cancelCourtApplicationLocked(tx, user, a.id, now);
    for (const match of preview.hosted) await tx.courtTransactionHandoff.upsert({ where: { matchId: match.id }, create: { matchId: match.id }, update: {} });
    await tx.user.update({ where: { id: user.id }, data: { status: "WITHDRAWN", withdrawnAt: now, matchNotificationsEnabled: false, profileImageObjectRef: null, profileImageContentType: null, kakaoProfileImageUrl: null } });
    return { withdrawnAt: now.toISOString() };
  }, { timeout: 20000 });
  if ("changed" in result) throw new DomainError("WITHDRAWAL_PREVIEW_CHANGED", 409, "신청 상태나 반환 금액이 바뀌었어요. 최신 내역을 다시 확인해 주세요.");
  await deleteStoredProfileImage(user.profileImageObjectRef);
  return result;
}
export async function setMatchNotificationsEnabled(prisma: PrismaClient, userId: string, enabled: boolean) {
  const updated = await prisma.user.update({ where: { id: userId }, data: { matchNotificationsEnabled: enabled } });
  return { matchNotificationsEnabled: updated.matchNotificationsEnabled };
}
