import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { listAnnouncements } from "@/server/domain/announcement-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET() {
  try {
    await getRateLimitedCurrentUser();
    return Response.json(await listAnnouncements(getPrisma()));
  } catch (error) {
    return handleApiError(error);
  }
}
