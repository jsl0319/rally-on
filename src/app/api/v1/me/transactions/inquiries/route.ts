import { getRateLimitedTransactionUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { createSupportInquiry, listMySupportInquiries, supportInquiryInputSchema } from "@/server/domain/support-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getRateLimitedTransactionUser();
    return Response.json(await listMySupportInquiries(getPrisma(), user.id, true));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRateLimitedTransactionUser();
    const input = supportInquiryInputSchema.parse(await request.json());
    return Response.json(await createSupportInquiry(getPrisma(), user.id, input, true));
  } catch (error) {
    return handleApiError(error);
  }
}
