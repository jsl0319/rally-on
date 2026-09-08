import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getMatchDetail, getOnboardedViewer } from "@/server/domain/match-service";
import { DomainError } from "@/server/domain/profile-service";
import { getKakaoDirections } from "@/server/integrations/kakao-directions";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    const user = await getRateLimitedCurrentUser();
    const prisma = getPrisma();
    const viewer = await getOnboardedViewer(prisma, user);
    const { court } = await getMatchDetail(prisma, viewer, matchId);
    if (court.source === "COURT_TBD" || !court.name || !court.address) throw new DomainError("DIRECTIONS_NOT_FOUND", 422, "코트 위치가 아직 정해지지 않았어요.");
    const href = await getKakaoDirections(court.name, court.address);
    return Response.json({ href }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleApiError(error); }
}
