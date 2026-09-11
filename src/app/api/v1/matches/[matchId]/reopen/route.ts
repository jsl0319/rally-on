import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { matchLifecycleInputSchema } from "@/server/domain/match";
import { getOnboardedViewer, reopenMatch } from "@/server/domain/match-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    const prisma = getPrisma();
    const viewer = await getOnboardedViewer(prisma, user);
    const input = matchLifecycleInputSchema.parse(await request.json());
    return Response.json(await reopenMatch(prisma, viewer, matchId, input));
  } catch (error) {
    return handleApiError(error);
  }
}
