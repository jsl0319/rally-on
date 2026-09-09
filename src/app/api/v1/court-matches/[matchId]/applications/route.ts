import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { applyToCourtMatch } from "@/server/domain/court-match-service";
import { getOnboardedViewer } from "@/server/domain/match-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    const prisma = getPrisma();
    const viewer = await getOnboardedViewer(prisma, user);
    return Response.json(await applyToCourtMatch(prisma, viewer, matchId), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
