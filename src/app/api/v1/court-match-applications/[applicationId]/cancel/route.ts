import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { cancelCourtMatchApplication, previewCourtMatchCancellation } from "@/server/domain/court-match-service";
import { courtCancellationInputSchema } from "@/server/domain/court-cancellation-preview";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const { applicationId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    return Response.json(await previewCourtMatchCancellation(getPrisma(), user, applicationId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const { applicationId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    const input = courtCancellationInputSchema.parse(await request.json());
    return Response.json(await cancelCourtMatchApplication(getPrisma(), user, applicationId, input));
  } catch (error) {
    return handleApiError(error);
  }
}
