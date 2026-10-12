import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getOnboardedViewer } from "@/server/domain/match-service";
import { getPublicCourtSlots } from "@/server/domain/court-slot-service";
import { courtDiscoveryQuerySchema } from "@/server/domain/court-slot";
import { apiError, handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getRateLimitedCurrentUser();
    await getOnboardedViewer(getPrisma(), user);
    const params = new URL(request.url).searchParams;
    const query = courtDiscoveryQuerySchema.safeParse(Object.fromEntries(params));
    if (!query.success) return apiError(400, "INVALID_REQUEST", "날짜·게임 유형·정렬 조건을 다시 확인해 주세요.");
    return Response.json(await getPublicCourtSlots(getPrisma(), false, undefined, query.data));
  } catch (error) {
    return handleApiError(error);
  }
}
