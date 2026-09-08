import { z } from "zod";
import { activeGameTypes } from "@/matches/game-type";

import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { createMatch, getMatches, getOnboardedViewer, parseCursor } from "@/server/domain/match-service";
import { matchCreateInputSchema } from "@/server/domain/match";
import { DomainError } from "@/server/domain/profile-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

const playPurposeSchema = z.enum([
  "CASUAL_HIT",
  "RALLY_PRACTICE",
  "STROKE_PRACTICE",
  "GAME_INTRO",
  "GAME",
]);

const matchSortSchema = z.enum(["recommended", "soonest", "newest"]);
const matchDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function parseSearchParams(request: Request) {
  const params = new URL(request.url).searchParams;
  const limitValue = params.get("limit") ?? "20";
  const limit = Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new DomainError("INVALID_REQUEST", 400, "목록 개수는 1~50개로 입력해 주세요.");
  }

  const startsFromValue = params.get("startsFrom");
  const startsFrom = startsFromValue ? new Date(startsFromValue) : new Date();
  if (Number.isNaN(startsFrom.getTime())) {
    throw new DomainError("INVALID_REQUEST", 400, "시작 시각 형식을 확인해 주세요.");
  }

  const playPurposeValue = params.get("playPurpose");
  const playPurpose = playPurposeValue ? playPurposeSchema.safeParse(playPurposeValue) : null;
  if (playPurpose && !playPurpose.success) {
    throw new DomainError("INVALID_REQUEST", 400, "원하는 플레이를 다시 선택해 주세요.");
  }

  const sortValue = params.get("sort");
  const sort = sortValue ? matchSortSchema.safeParse(sortValue) : null;
  if (sort && !sort.success) {
    throw new DomainError("INVALID_REQUEST", 400, "정렬 방식을 다시 선택해 주세요.");
  }

  const dateValue = params.get("date");
  const date = dateValue ? matchDateSchema.safeParse(dateValue) : null;
  if (date && !date.success) {
    throw new DomainError("INVALID_REQUEST", 400, "날짜 형식을 확인해 주세요.");
  }

  const gameTypeValue = params.get("gameType");
  const gameType = gameTypeValue === null ? null : z.enum(activeGameTypes).safeParse(gameTypeValue);
  if (gameType && !gameType.success) throw new DomainError("INVALID_REQUEST", 400, "게임 유형을 다시 선택해 주세요.");

  return {
    gameType: gameType?.data,
    playPurpose: playPurpose?.data,
    startsFrom,
    cursor: params.get("cursor") ? parseCursor(params.get("cursor")!) : undefined,
    limit,
    sort: sort?.data,
    date: date?.data,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    const viewer = await getOnboardedViewer(getPrisma(), user);
    return Response.json(await getMatches(getPrisma(), viewer, parseSearchParams(request)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    const viewer = await getOnboardedViewer(getPrisma(), user);
    const result = await createMatch(getPrisma(), viewer, matchCreateInputSchema.parse(await request.json()));
    return Response.json(result.match, { status: result.created ? 201 : 200, headers: { Location: `/api/v1/matches/${result.match.id}`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
