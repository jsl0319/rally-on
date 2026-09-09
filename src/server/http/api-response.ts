import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ZodError } from "zod";

import { AccountAccessError, AuthenticationError } from "@/server/auth/current-user";
import { DomainError } from "@/server/domain/profile-service";
import { ApiRateLimitError } from "@/server/http/api-rate-limit";

export function apiError(
  status: number,
  code: string,
  message: string,
  fieldErrors: Array<{ field: string; message: string }> = [],
) {
  return NextResponse.json({ error: { code, message, fieldErrors } }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return apiError(401, "UNAUTHENTICATED", error.message);
  }

  if (error instanceof AccountAccessError) {
    return apiError(403, "FORBIDDEN", error.message);
  }

  if (error instanceof ApiRateLimitError) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: error.message, fieldErrors: [] } },
      { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }

  if (error instanceof DomainError) {
    return apiError(error.status, error.code, error.message);
  }

  // 본문이 비어 있거나 중간에 끊긴 요청에서 `request.json()`이 SyntaxError를 던진다.
  // 브라우저 탭을 닫는 순간 전송되던 요청이 대표적이다. 서버 잘못이 아니므로
  // 500이 아니라 400으로 답하고, 오류 로그도 남기지 않는다.
  if (error instanceof SyntaxError && /JSON/i.test(error.message)) {
    return apiError(400, "INVALID_REQUEST_BODY", "요청 내용을 읽지 못했어요. 다시 시도해 주세요.");
  }

  if (error instanceof ZodError) {
    return apiError(
      422,
      "VALIDATION_FAILED",
      "입력한 내용을 다시 확인해 주세요.",
      error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error({ event: "api.database_error", code: error.code, meta: error.meta });

    if (error.code === "P2004") {
      return apiError(422, "DATABASE_CONSTRAINT_FAILED", "입력한 내용을 다시 확인해 주세요.");
    }
  } else if (error instanceof Error) {
    console.error({ event: "api.unexpected_error", name: error.name });
  } else {
    console.error({ event: "api.unexpected_error", name: "UnknownError" });
  }

  return apiError(500, "INTERNAL_ERROR", "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
}
