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
  requestId?: string,
) {
  return NextResponse.json(
    { error: { code, message, fieldErrors, ...(requestId ? { requestId } : {}) } },
    { status, ...(requestId ? { headers: { "X-Request-Id": requestId } } : {}) },
  );
}

/**
 * 예상 못 한 오류에 붙이는 추적 번호.
 *
 * 지금까지 서버 로그에는 오류 이름 한 줄만 남아서, 사용자가 "안 돼요"라고 해도
 * 무엇이 왜 실패했는지 되짚을 방법이 없었다. 응답과 로그에 같은 번호를 남기면
 * 사용자가 본 화면과 서버 기록을 이어 붙일 수 있다.
 */
function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** 스택은 서버 로그에만 남긴다. 응답에는 추적 번호만 나간다. */
function topStackFrames(error: Error, limit = 6) {
  return error.stack?.split("\n").slice(1, limit + 1).map((frame) => frame.trim()) ?? [];
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

  const requestId = newRequestId();

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error({ event: "api.database_error", requestId, code: error.code, meta: error.meta, stack: topStackFrames(error) });

    if (error.code === "P2004") {
      return apiError(422, "DATABASE_CONSTRAINT_FAILED", "입력한 내용을 다시 확인해 주세요.", [], requestId);
    }
  } else if (error instanceof Error) {
    console.error({ event: "api.unexpected_error", requestId, name: error.name, message: error.message, stack: topStackFrames(error) });
  } else {
    console.error({ event: "api.unexpected_error", requestId, name: "UnknownError", value: String(error) });
  }

  return apiError(500, "INTERNAL_ERROR", "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.", [], requestId);
}
