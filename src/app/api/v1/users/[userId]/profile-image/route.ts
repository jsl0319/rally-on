import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getProfileImageSource, getStoredProfileImage } from "@/server/domain/profile-image-service";
import { DomainError } from "@/server/domain/profile-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

/** 프로필 사진은 로그인한 이용자에게만 제공한다. 매칭에서 상대를 확인하는 용도다. */
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await context.params;
    await getCurrentUser();
    const source = await getProfileImageSource(getPrisma(), userId);

    if (source.kind === "kakao") {
      return NextResponse.redirect(source.url, { status: 307, headers: { "Cache-Control": "private, max-age=300" } });
    }

    const result = await getStoredProfileImage(source.objectRef, request.headers.get("if-none-match"));
    if (!result) throw new DomainError("PROFILE_IMAGE_NOT_FOUND", 404, "프로필 사진을 찾을 수 없어요.");

    const headers = new Headers({
      "Cache-Control": "private, max-age=300",
      "ETag": result.blob.etag,
      "X-Content-Type-Options": "nosniff",
    });
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers });

    headers.set("Content-Type", result.blob.contentType);
    return new NextResponse(result.stream, { headers });
  } catch (error) {
    return handleApiError(error);
  }
}
