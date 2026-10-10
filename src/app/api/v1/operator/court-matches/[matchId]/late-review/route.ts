import { z } from "zod";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { courtLateReviewInputSchema } from "@/server/domain/court-match-composition";
import { resolveCourtLateReview } from "@/server/domain/court-match-composition-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { matchId } = await context.params;
    const input = courtLateReviewInputSchema.parse(await request.json());
    return Response.json(await resolveCourtLateReview(getPrisma(), user, z.uuid().parse(matchId), input));
  } catch (error) { return handleApiError(error); }
}
