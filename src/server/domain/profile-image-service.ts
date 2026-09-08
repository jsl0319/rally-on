import { del, get, put } from "@vercel/blob";

import type { PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/server/domain/profile-service";

export const profileImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxProfileImageBytes = 5 * 1024 * 1024;

type ProfileImageContentType = (typeof profileImageContentTypes)[number];

type ProfileImageOwner = {
  id: string;
  kakaoProfileImageUrl: string | null;
  profileImageObjectRef: string | null;
  profileImageUpdatedAt: Date | null;
};

function isProfileImageContentType(value: string): value is ProfileImageContentType {
  return (profileImageContentTypes as readonly string[]).includes(value);
}

/** 확장자만 믿지 않고 실제 바이트 시그니처까지 확인한다(채팅 사진과 같은 규칙). */
function hasExpectedSignature(contentType: ProfileImageContentType, bytes: Buffer) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function extensionFor(contentType: ProfileImageContentType) {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
}

function validateImage(file: File) {
  if (!isProfileImageContentType(file.type)) {
    throw new DomainError("PROFILE_IMAGE_TYPE_NOT_ALLOWED", 422, "프로필 사진은 JPEG, PNG, WebP만 올릴 수 있어요.");
  }
  if (file.size < 1 || file.size > maxProfileImageBytes) {
    throw new DomainError("PROFILE_IMAGE_SIZE_INVALID", 422, "프로필 사진은 5 MiB 이하로 올려 주세요.");
  }
  return file.type;
}

/** Blob 저장소가 연결되지 않은 환경에서 원인을 알기 어려운 500으로 끝나지 않게 한다. */
function requireBlobStore() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new DomainError("PROFILE_IMAGE_STORE_UNAVAILABLE", 503, "사진 저장소가 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
  }
}

/**
 * 화면에서 쓸 프로필 사진 주소. 직접 올린 사진이 있으면 그것을, 없으면 카카오 사진을
 * 보여 준다. 둘 다 없으면 null이고 화면은 기본 아이콘을 그린다.
 */
export function getProfileImageUrl(owner: ProfileImageOwner) {
  if (!owner.profileImageObjectRef && !owner.kakaoProfileImageUrl) return null;
  return `/api/v1/users/${owner.id}/profile-image?v=${owner.profileImageUpdatedAt?.getTime() ?? 0}`;
}

export async function replaceProfileImage(prisma: PrismaClient, userId: string, file: File) {
  const contentType = validateImage(file);
  requireBlobStore();

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size || !hasExpectedSignature(contentType, bytes)) {
    throw new DomainError("PROFILE_IMAGE_SIGNATURE_INVALID", 422, "사진 파일 형식을 다시 확인해 주세요.");
  }

  const current = await prisma.user.findUnique({ where: { id: userId }, select: { profileImageObjectRef: true } });
  const blob = await put(
    `profile-images/${userId}/${crypto.randomUUID()}.${extensionFor(contentType)}`,
    bytes,
    { access: "private", contentType, addRandomSuffix: false },
  );

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { profileImageObjectRef: blob.url, profileImageContentType: contentType, profileImageUpdatedAt: new Date() },
    });
    // 새 사진이 자리를 잡은 뒤에 이전 사진을 지운다.
    if (current?.profileImageObjectRef) await del(current.profileImageObjectRef).catch(() => undefined);
    return { profileImageUrl: getProfileImageUrl(updated) };
  } catch (error) {
    await del(blob.url).catch(() => undefined);
    throw error;
  }
}

/** 직접 올린 사진만 지운다. 카카오 사진이 있으면 다시 그것으로 돌아간다. */
export async function removeProfileImage(prisma: PrismaClient, userId: string) {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { profileImageObjectRef: true } });
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { profileImageObjectRef: null, profileImageContentType: null, profileImageUpdatedAt: new Date() },
  });
  if (current?.profileImageObjectRef) await del(current.profileImageObjectRef).catch(() => undefined);
  return { profileImageUrl: getProfileImageUrl(updated) };
}

/** 탈퇴처럼 계정을 정리할 때 올린 사진도 함께 지운다. */
export async function deleteStoredProfileImage(objectRef: string | null) {
  if (!objectRef) return;
  await del(objectRef).catch(() => undefined);
}

export async function getProfileImageSource(prisma: PrismaClient, userId: string) {
  const owner = await prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE" },
    select: { profileImageObjectRef: true, profileImageContentType: true, kakaoProfileImageUrl: true },
  });
  if (!owner) throw new DomainError("PROFILE_IMAGE_NOT_FOUND", 404, "프로필 사진을 찾을 수 없어요.");
  if (owner.profileImageObjectRef) {
    return { kind: "stored" as const, objectRef: owner.profileImageObjectRef, contentType: owner.profileImageContentType };
  }
  if (owner.kakaoProfileImageUrl) return { kind: "kakao" as const, url: owner.kakaoProfileImageUrl };
  throw new DomainError("PROFILE_IMAGE_NOT_FOUND", 404, "프로필 사진을 찾을 수 없어요.");
}

export async function getStoredProfileImage(objectRef: string, ifNoneMatch: string | null) {
  return get(objectRef, {
    access: "private",
    ...(ifNoneMatch ? { ifNoneMatch } : {}),
  });
}
