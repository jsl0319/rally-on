import { getRateLimitedTransactionUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getMyCourtTransactions } from "@/server/domain/court-match-view";
import { handleApiError } from "@/server/http/api-response";
export async function GET() {
  try { const user = await getRateLimitedTransactionUser(); return Response.json(await getMyCourtTransactions(getPrisma(), user.id)); }
  catch (error) { return handleApiError(error); }
}
