import { NextResponse } from "next/server";

import { getPrisma } from "@/server/db/prisma";
import { reconcileCourtMatches } from "@/server/domain/court-match-service";
import { reconcileStartedMatches } from "@/server/domain/match-service";
import { reconcileExpiredConversations } from "@/server/domain/match-chat-service";

export const runtime = "nodejs";

function hasValidCronSecret(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    // 코트 매칭 정리를 먼저 돌린다. 입금 기한 만료로 취소가 나면 그만큼 자리가
    // 풀리고, 그 결과가 아래의 시작 시각 기반 보정에도 반영돼야 한다.
    const courtMatches = await reconcileCourtMatches(prisma);
    const [result, conversations] = await Promise.all([reconcileStartedMatches(prisma), reconcileExpiredConversations(prisma)]);

    console.info({ event: "cron.reconcile_started_matches.completed", ...result, conversations, courtMatches });

    return NextResponse.json({ status: "ok", ...result, conversations, courtMatches });
  } catch (error) {
    console.error({
      event: "cron.reconcile_started_matches.failed",
      name: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json(
      { status: "error", message: "상태 보정 작업을 완료하지 못했어요." },
      { status: 500 },
    );
  }
}
