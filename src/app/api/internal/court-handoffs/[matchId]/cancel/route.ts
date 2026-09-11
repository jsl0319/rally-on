import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { cancelHandedOffCourtMatch, handoffInputSchema } from "@/server/domain/court-transaction-handoff";
import { handleApiError } from "@/server/http/api-response";
export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { const user = await getRateLimitedCurrentUser(); const { matchId } = await context.params; return Response.json(await cancelHandedOffCourtMatch(getPrisma(), user.id, matchId, handoffInputSchema.parse(await request.json()))); }
  catch (error) { return handleApiError(error); }
}
