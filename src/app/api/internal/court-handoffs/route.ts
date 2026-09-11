import { z } from "zod";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { listCourtHandoffs } from "@/server/domain/court-transaction-handoff";
import { handleApiError } from "@/server/http/api-response";
export async function GET(request: Request) {
  try { const user = await getRateLimitedCurrentUser(); const cursor = z.uuid().optional().parse(new URL(request.url).searchParams.get("cursor") ?? undefined); return Response.json(await listCourtHandoffs(getPrisma(), user.id, cursor)); }
  catch (error) { return handleApiError(error); }
}
