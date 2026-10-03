import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { courtCreateInputSchema } from "@/server/domain/court-slot";
import { createCourt, getMyCourts } from "@/server/domain/court-slot-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser();
    return Response.json(await getMyCourts(getPrisma(), user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    return Response.json(
      await createCourt(getPrisma(), user, courtCreateInputSchema.parse(await request.json())),
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
