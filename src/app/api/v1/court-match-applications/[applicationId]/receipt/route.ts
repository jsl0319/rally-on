import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { recordCourtReceipt } from "@/server/domain/court-match-money-service";
import { courtReceiptInputSchema } from "@/server/domain/court-match-money";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { applicationId } = await context.params;
    return Response.json(await recordCourtReceipt(getPrisma(), user, applicationId, courtReceiptInputSchema.parse(await request.json())));
  } catch (error) { return handleApiError(error); }
}
