import { z } from "zod";

import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { nicknameSchema } from "@/server/domain/profile";
import { getProfileImageUrl } from "@/server/domain/profile-image-service";
import { getProfile, toProfileView } from "@/server/domain/profile-service";
import { apiError, handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

const meUpdateSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    matchNotificationsEnabled: z.boolean().optional(),
  })
  .refine((value) => value.nickname !== undefined || value.matchNotificationsEnabled !== undefined, {
    message: "변경할 값을 입력해 주세요.",
  });

export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser();
    const profile = await getProfile(getPrisma(), user.id);

    return Response.json({
      id: user.id,
      nickname: user.nickname,
      nicknameConfirmed: user.nicknameConfirmedAt !== null,
      status: user.status,
      onboardingCompleted: user.onboardingCompletedAt !== null,
      matchNotificationsEnabled: user.matchNotificationsEnabled,
      profileImageUrl: getProfileImageUrl(user),
      tennisProfile: profile ? toProfileView(profile) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    const input = meUpdateSchema.parse(await request.json());
    const prisma = getPrisma();

    if (input.nickname !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { nickname: input.nickname, NOT: { id: user.id } },
        select: { id: true },
      });
      if (existing) {
        return apiError(409, "NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임이에요.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(input.nickname !== undefined ? { nickname: input.nickname, nicknameConfirmedAt: new Date() } : {}),
        ...(input.matchNotificationsEnabled !== undefined ? { matchNotificationsEnabled: input.matchNotificationsEnabled } : {}),
      },
    });

    return Response.json({
      id: updated.id,
      nickname: updated.nickname,
      nicknameConfirmed: updated.nicknameConfirmedAt !== null,
      status: updated.status,
      onboardingCompleted: updated.onboardingCompletedAt !== null,
      matchNotificationsEnabled: updated.matchNotificationsEnabled,
      profileImageUrl: getProfileImageUrl(updated),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
