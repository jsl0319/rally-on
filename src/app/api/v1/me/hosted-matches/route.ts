import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getHostedMatches, getOnboardedViewer } from "@/server/domain/match-service";
import { handleApiError } from "@/server/http/api-response";
import { getActivityReadReceipt } from "@/server/domain/notification-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser();
    const viewer = await getOnboardedViewer(getPrisma(), user);
    const activityReadReceipt = await getActivityReadReceipt(getPrisma(), user.id, "received");
    return Response.json({ items: await getHostedMatches(getPrisma(), viewer), activityReadReceipt });
  } catch (error) { return handleApiError(error); }
}
