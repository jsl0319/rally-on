import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getMyNotifications } from "@/server/domain/notification-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser();
    return Response.json(await getMyNotifications(getPrisma(), user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
