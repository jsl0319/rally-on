import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
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

/**
 * 요청을 처리하는 도중에 계정이 사라질 수 있다. 탈퇴한 사람의 다른 탭이 배지나 채팅을
 * 다시 불러오는 순간이 그렇다. 그때 rate limit 행을 만들면 외래 키 위반으로 500이 난다.
 * 사라진 계정에 돌려줄 답은 서버 오류가 아니라 다시 로그인하라는 안내다.
 */
async function countRequest(userId: string) {
  try {
    await enforceApiRateLimit(getPrisma(), userId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new AuthenticationError("계정을 찾을 수 없어요. 다시 로그인해 주세요.");
    }
    throw error;
  }
}

export async function getRateLimitedCurrentUser() {
  const user = await getCurrentUser();
  await countRequest(user.id);
  return user;
}

/** Authentication only; every caller must scope reads/writes to the caller's existing transactions. */
export async function getRateLimitedTransactionUser() {
  const user = await getTransactionUser();
  await countRequest(user.id);
  return user;
}
