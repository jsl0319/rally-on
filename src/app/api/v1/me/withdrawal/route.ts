import { z } from "zod";
import { getRateLimitedCurrentUser, getRateLimitedTransactionUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { previewWithdrawal, withdrawAccount } from "@/server/domain/account-service";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await getRateLimitedCurrentUser(); return Response.json(await previewWithdrawal(getPrisma(), user.id)); }
  catch (error) { return handleApiError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getRateLimitedTransactionUser();
    const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await request.json());
    return Response.json(await withdrawAccount(getPrisma(), user, input.token));
  } catch (error) { return handleApiError(error); }
}
