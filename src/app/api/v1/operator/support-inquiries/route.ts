import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { listSupportQueue, supportListQuerySchema } from "@/server/domain/support-service";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    return Response.json(await listSupportQueue(getPrisma(), user, "operator", supportListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
  } catch (error) { return handleApiError(error); }
}
