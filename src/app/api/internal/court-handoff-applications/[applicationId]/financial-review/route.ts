import { getCurrentUser, getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getCourtFinancialReview, recordCourtFinancialReview } from "@/server/domain/court-financial-review-service";
import { financialReviewInputSchema } from "@/server/domain/court-financial-review";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ applicationId: string }> };
function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function GET(_request: Request, context: Context) {
  try {
    const user = await getCurrentUser();
    const { applicationId } = await context.params;
    return privateResponse(Response.json(await getCourtFinancialReview(getPrisma(), user.id, applicationId, true)));
  } catch (error) { return privateResponse(handleApiError(error)); }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { applicationId } = await context.params;
    return privateResponse(Response.json(await recordCourtFinancialReview(getPrisma(), user.id, applicationId,
      financialReviewInputSchema.parse(await request.json()), true)));
  } catch (error) { return privateResponse(handleApiError(error)); }
}
