import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { courtIdSchema, courtSettlementAccountInputSchema } from "@/server/domain/court-slot";
import { updateCourtSettlementAccount } from "@/server/domain/court-slot-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ courtId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { courtId } = await params;
    return Response.json(await updateCourtSettlementAccount(
      getPrisma(),
      user,
      courtIdSchema.parse(courtId),
      courtSettlementAccountInputSchema.parse(await request.json()),
    ));
  } catch (error) {
    return handleApiError(error);
  }
}
