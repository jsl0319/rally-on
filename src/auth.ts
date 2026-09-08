import NextAuth from "next-auth";
import Kakao from "next-auth/providers/kakao";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";

function fallbackNickname(providerAccountId: string) {
  return `테니스${providerAccountId.slice(-6)}`.slice(0, 12);
}

function initialNickname(profile: Record<string, unknown>, providerAccountId: string) {
  const candidate = typeof profile.properties === "object" && profile.properties
    ? (profile.properties as { nickname?: unknown }).nickname
    : profile.nickname;
  const normalized = typeof candidate === "string"
    ? candidate.replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 12)
    : "";

  return normalized.length >= 2 ? normalized : fallbackNickname(providerAccountId);
}

/**
 * 카카오가 주는 프로필 이미지 주소. 동의 항목에 따라 없을 수 있고, 응답 모양도
 * properties / kakao_account 두 갈래라 둘 다 확인한다.
 */
function kakaoProfileImageUrl(profile: Record<string, unknown>) {
  const properties = typeof profile.properties === "object" && profile.properties ? profile.properties as Record<string, unknown> : {};
  const account = typeof profile.kakao_account === "object" && profile.kakao_account ? profile.kakao_account as Record<string, unknown> : {};
  const accountProfile = typeof account.profile === "object" && account.profile ? account.profile as Record<string, unknown> : {};
  const candidate = [properties.profile_image, accountProfile.profile_image_url, properties.thumbnail_image, accountProfile.thumbnail_image_url]
    .find((value) => typeof value === "string" && value.startsWith("https://"));

  return typeof candidate === "string" && candidate.length <= 500 ? candidate : null;
}

async function uniqueInitialNickname(base: string) {
  const prisma = getPrisma();
  let suffix = 0;
  let candidate = base;

  while (await prisma.user.findUnique({ where: { nickname: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base.slice(0, 12 - String(suffix).length)}${suffix}`;
  }

  return candidate;
}

async function createInitialUser(provider: string, providerAccountId: string, profile: Record<string, unknown>) {
  const prisma = getPrisma();
  const baseNickname = initialNickname(profile, providerAccountId);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await prisma.user.create({
        data: {
          nickname: await uniqueInitialNickname(baseNickname),
          kakaoProfileImageUrl: kakaoProfileImageUrl(profile),
          authAccounts: { create: { provider, providerAccountId } },
        },
      });
      return;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;

      const linkedAccount = await prisma.authAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { id: true },
      });
      if (linkedAccount) return;
    }
  }

  throw new Error("계정을 준비하지 못했어요. 잠시 후 다시 로그인해 주세요.");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Kakao],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "kakao" || !account.providerAccountId || !profile) return false;

      const existingAccount = await getPrisma().authAccount.findUnique({
        where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
      });
      if (existingAccount) {
        // 카카오에서 사진을 바꿨을 수 있으니 기본값을 최신으로 유지한다.
        await getPrisma().user.update({
          where: { id: existingAccount.userId },
          data: { kakaoProfileImageUrl: kakaoProfileImageUrl(profile as Record<string, unknown>) },
        }).catch(() => undefined);
        return true;
      }

      await createInitialUser(account.provider, account.providerAccountId, profile as Record<string, unknown>);
      return true;
    },
    async jwt({ token, account }) {
      if (account?.provider && account.providerAccountId) {
        const linkedAccount = await getPrisma().authAccount.findUnique({
          where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
          select: { userId: true },
        });
        token.userId = linkedAccount?.userId;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
});
