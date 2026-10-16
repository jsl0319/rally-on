import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getOnboardedViewer, getSentApplications } from "@/server/domain/match-service";
import { handleApiError } from "@/server/http/api-response";
import { getActivityReadReceipt } from "@/server/domain/notification-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser();
    const prisma = getPrisma();
    const viewer = await getOnboardedViewer(prisma, user);
    const activityReadReceipt = await getActivityReadReceipt(prisma, user.id, "sent");
    return Response.json({ ...await getSentApplications(prisma, viewer), activityReadReceipt });
  } catch (error) {
    return handleApiError(error);
  }
}
