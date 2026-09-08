import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { markNotificationsRead } from "@/server/domain/notification-service";
import { notificationReadInputSchema } from "@/server/domain/notification";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    const body: unknown = await request.json().catch(() => ({}));
    const input = notificationReadInputSchema.parse(body ?? {});
    return Response.json(await markNotificationsRead(getPrisma(), user.id, input.ids));
  } catch (error) {
    return handleApiError(error);
  }
}
