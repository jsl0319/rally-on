import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { depositClaimInputSchema } from "@/server/domain/court-match";
import { claimCourtMatchDeposit } from "@/server/domain/court-match-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const { applicationId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    return Response.json(await claimCourtMatchDeposit(
      getPrisma(),
      user,
      applicationId,
      depositClaimInputSchema.parse(await request.json()),
    ));
  } catch (error) {
    return handleApiError(error);
  }
}
