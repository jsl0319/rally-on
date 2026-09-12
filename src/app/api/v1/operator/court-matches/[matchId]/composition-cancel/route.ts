import { z } from "zod";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { compositionCancellationInputSchema } from "@/server/domain/court-match-composition";
import { cancelCourtMatchForComposition } from "@/server/domain/court-match-composition-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const { matchId } = await context.params;
    const input = compositionCancellationInputSchema.parse(await request.json());
    return Response.json(await cancelCourtMatchForComposition(getPrisma(), user, z.uuid().parse(matchId), input));
  } catch (error) { return handleApiError(error); }
}
