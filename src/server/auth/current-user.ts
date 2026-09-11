import { auth } from "@/auth";
import { getPrisma } from "@/server/db/prisma";
import { enforceApiRateLimit } from "@/server/http/api-rate-limit-service";

export class AuthenticationError extends Error {}
export class AccountAccessError extends Error {}

export async function getTransactionUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new AuthenticationError("로그인이 필요해요.");
  }

  const user = await getPrisma().user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AuthenticationError("계정을 찾을 수 없어요. 다시 로그인해 주세요.");
  }

  return user;
}

export async function getCurrentUser() {
  const user = await getTransactionUser();
  if (user.status !== "ACTIVE") {
    throw new AccountAccessError("현재 계정으로는 서비스를 이용할 수 없어요.");
  }

  return user;
}

export async function getRateLimitedCurrentUser() {
  const user = await getCurrentUser();
  await enforceApiRateLimit(getPrisma(), user.id);
  return user;
}

/** Authentication only; every caller must scope reads/writes to the caller's existing transactions. */
export async function getRateLimitedTransactionUser() {
  const user = await getTransactionUser();
  await enforceApiRateLimit(getPrisma(), user.id);
  return user;
}
