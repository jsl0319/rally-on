import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "./profile-service";

// Shared for court writes; exclusive only for rare account withdrawals. Always
// take this gate BEFORE match/inquiry locks. Different matches still run concurrently.
export async function lockAccountTransactions(tx: Prisma.TransactionClient, exclusive = false) {
  if (exclusive) await tx.$queryRaw`SELECT pg_advisory_xact_lock(72604, 1)::text`;
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(72604, 1)::text`;
}
export async function assertActiveTransactionUser(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, role: true } });
  if (user?.status !== "ACTIVE") throw new DomainError("ACCOUNT_INACTIVE", 403, "이 계정은 새 참가·모집을 진행할 수 없어요.");
  return user;
}
