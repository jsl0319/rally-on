import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ProfileInput } from "@/server/domain/profile";

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const profileInclude = {
  purposes: true,
} satisfies Prisma.TennisProfileInclude;

export type ProfileWithRelations = Prisma.TennisProfileGetPayload<{
  include: typeof profileInclude;
}>;

export function toProfileView(profile: ProfileWithRelations) {
  return {
    gender: profile.gender ?? null,
    experienceRange: profile.experienceRange,
    rallyLevel: profile.rallyLevel,
    gameExperience: profile.gameExperience,
    playPurposes: profile.purposes.map(({ purpose }) => purpose),
    version: profile.version,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function getProfile(prisma: PrismaClient, userId: string) {
  return prisma.tennisProfile.findUnique({
    where: { userId },
    include: profileInclude,
  });
}

export async function saveProfile(
  prisma: PrismaClient,
  userId: string,
  input: ProfileInput,
) {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.tennisProfile.findUnique({
      where: { userId },
      select: { id: true, version: true },
    });

    if (!current && input.expectedVersion !== null) {
      throw new DomainError("VERSION_CONFLICT", 409, "프로필을 다시 불러온 뒤 저장해 주세요.");
    }

    if (current && input.expectedVersion !== current.version) {
      throw new DomainError("VERSION_CONFLICT", 409, "다른 곳에서 프로필이 변경됐어요. 최신 정보를 확인해 주세요.");
    }

    const profile = current
      ? await transaction.tennisProfile.update({
          where: { id: current.id },
          data: {
            gender: input.gender,
            experienceRange: input.experienceRange,
            rallyLevel: input.rallyLevel,
            gameExperience: input.gameExperience,
            version: { increment: 1 },
            purposes: {
              deleteMany: {},
              create: input.playPurposes.map((purpose) => ({ purpose })),
            },
          },
          include: profileInclude,
        })
      : await transaction.tennisProfile.create({
          data: {
            userId,
            gender: input.gender,
            experienceRange: input.experienceRange,
            rallyLevel: input.rallyLevel,
            gameExperience: input.gameExperience,
            purposes: { create: input.playPurposes.map((purpose) => ({ purpose })) },
          },
          include: profileInclude,
        });

    await transaction.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() },
    });

    return profile;
  });
}
