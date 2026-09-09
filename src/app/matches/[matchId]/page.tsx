import { M3MatchDetail } from "@/features/matches/m3-match-detail";
import { requireOnboardedPage } from "@/server/auth/require-onboarded-page";
import { getPrisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  await requireOnboardedPage(`/matches/${encodeURIComponent(matchId)}`);
  const match = await getPrisma().match.findUnique({ where: { id: matchId }, select: { courtSource: true, courtSlotId: true } });
  if (match?.courtSource === "PARTNER_COURT" && match.courtSlotId) redirect(`/partner-sessions/${match.courtSlotId}`);
  return <M3MatchDetail params={params} />;
}
