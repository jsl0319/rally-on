import type { PrismaClient, User } from "@/generated/prisma/client";

import { deleteStoredProfileImage } from "@/server/domain/profile-image-service";
import { DomainError } from "@/server/domain/profile-service";

/**
 * Soft-deletes the account: getCurrentUser() already rejects any user whose
 * status isn't ACTIVE, so flipping the status is enough to lock the account
 * out immediately. We keep the row (nickname, history) instead of deleting
 * it, matching the soft-delete pattern already used for courts/uploads.
 */
export async function withdrawAccount(prisma: PrismaClient, user: User) {
  if (user.status !== "ACTIVE") {
    throw new DomainError("ACCOUNT_ALREADY_INACTIVE", 409, "이미 처리된 계정이에요.");
  }
  const withdrawnAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "WITHDRAWN", withdrawnAt, profileImageObjectRef: null, profileImageContentType: null },
  });
  // 계정 접근을 막는 것과 별개로, 올린 사진은 저장소에서도 지운다.
  await deleteStoredProfileImage(user.profileImageObjectRef);
  return { withdrawnAt: withdrawnAt.toISOString() };
}

export async function setMatchNotificationsEnabled(prisma: PrismaClient, userId: string, enabled: boolean) {
  const updated = await prisma.user.update({ where: { id: userId }, data: { matchNotificationsEnabled: enabled } });
  return { matchNotificationsEnabled: updated.matchNotificationsEnabled };
}
