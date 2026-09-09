import { z } from "zod";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getOperatorCourtMatch } from "@/server/domain/court-match-view";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { matchId } = await params;
    return Response.json(await getOperatorCourtMatch(getPrisma(), user, z.string().uuid().parse(matchId)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return handleApiError(error); }
}
