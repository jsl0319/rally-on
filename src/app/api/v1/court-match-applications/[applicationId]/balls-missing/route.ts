import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { recordCourtMissingBalls } from "@/server/domain/court-match-money-service";
import { courtMissingBallsInputSchema } from "@/server/domain/court-match-money";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { applicationId } = await context.params;
    return Response.json(await recordCourtMissingBalls(getPrisma(), user, applicationId, courtMissingBallsInputSchema.parse(await request.json())), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error); }
}
