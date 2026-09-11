import { getRateLimitedTransactionUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { actOnSupportInquiry, supportActionInputSchema } from "@/server/domain/support-service";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ inquiryId: string }> }) {
  try {
    const user = await getRateLimitedTransactionUser();
    const { inquiryId } = await context.params;
    return Response.json(await actOnSupportInquiry(getPrisma(), user, inquiryId, "member", supportActionInputSchema.parse(await request.json()), true));
  } catch (error) { return handleApiError(error); }
}
