import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { courtMatchDecisionInputSchema } from "@/server/domain/court-match";
import { decideCourtMatchApplication } from "@/server/domain/court-match-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const { applicationId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    return Response.json(await decideCourtMatchApplication(
      getPrisma(),
      user,
      applicationId,
      courtMatchDecisionInputSchema.parse(await request.json()),
    ));
  } catch (error) {
    return handleApiError(error);
  }
}
