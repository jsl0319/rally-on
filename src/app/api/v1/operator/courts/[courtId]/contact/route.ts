import { courtContactInputSchema, courtContactStopInputSchema } from "@/matches/court-contact";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { courtIdSchema } from "@/server/domain/court-slot";
import { updateCourtContact } from "@/server/domain/court-slot-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ courtId: string }> };

async function save(request: Request, { params }: Context, stop: boolean) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { courtId } = await params;
    const input = (stop ? courtContactStopInputSchema : courtContactInputSchema).parse(await request.json());
    return Response.json(await updateCourtContact(getPrisma(), user, courtIdSchema.parse(courtId), input, stop), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return handleApiError(error); }
}

export async function PUT(request: Request, context: Context) { return save(request, context, false); }
export async function DELETE(request: Request, context: Context) { return save(request, context, true); }
