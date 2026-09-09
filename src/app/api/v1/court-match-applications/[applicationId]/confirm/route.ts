import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { confirmCourtMatchDeposit } from "@/server/domain/court-match-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const { applicationId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    return Response.json(await confirmCourtMatchDeposit(getPrisma(), user, applicationId));
  } catch (error) {
    return handleApiError(error);
  }
}
