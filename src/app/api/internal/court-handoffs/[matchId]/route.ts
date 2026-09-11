import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getOperatorCourtMatch } from "@/server/domain/court-match-view";
import { claimCourtHandoff, handoffInputSchema } from "@/server/domain/court-transaction-handoff";
import { handleApiError } from "@/server/http/api-response";
export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { const user = await getRateLimitedCurrentUser(); const { matchId } = await context.params; return Response.json(await getOperatorCourtMatch(getPrisma(), user, matchId, true)); }
  catch (error) { return handleApiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { const user = await getRateLimitedCurrentUser(); const { matchId } = await context.params; return Response.json(await claimCourtHandoff(getPrisma(), user.id, matchId, handoffInputSchema.parse(await request.json()))); }
  catch (error) { return handleApiError(error); }
}
