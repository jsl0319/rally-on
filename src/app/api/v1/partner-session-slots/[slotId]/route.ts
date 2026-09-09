import { z } from "zod";

import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { getOnboardedViewer } from "@/server/domain/match-service";
import { getPublicCourtSlot } from "@/server/domain/court-slot-service";
import { handleApiError } from "@/server/http/api-response";
import { getCourtMatchParticipation } from "@/server/domain/court-match-view";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slotId: string }> }) {
  try {
    const user = await getRateLimitedCurrentUser();
    const prisma = getPrisma();
    const viewer = await getOnboardedViewer(prisma, user);
    const { slotId } = await params;
    const slot = await getPublicCourtSlot(prisma, z.string().uuid("제휴 코트 시간을 다시 선택해 주세요.").parse(slotId), user.id);
    const participation = slot.session ? await getCourtMatchParticipation(prisma, viewer, slot.session.matchId) : null;
    return Response.json({ ...slot, participation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
