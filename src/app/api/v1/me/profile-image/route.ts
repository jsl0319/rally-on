import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { removeProfileImage, replaceProfileImage } from "@/server/domain/profile-image-service";
import { DomainError } from "@/server/domain/profile-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    const formData = await request.formData();
    const files = formData.getAll("file");
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File)) {
      throw new DomainError("PROFILE_IMAGE_FILE_REQUIRED", 422, "프로필 사진 파일을 선택해 주세요.");
    }
    if ([...formData.keys()].some((key) => key !== "file")) {
      throw new DomainError("INVALID_REQUEST", 400, "프로필 사진 파일만 올려 주세요.");
    }
    return Response.json(await replaceProfileImage(getPrisma(), user.id, file));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await getRateLimitedCurrentUser();
    return Response.json(await removeProfileImage(getPrisma(), user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
