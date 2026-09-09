import { OperatorCourtMatchDetail } from "@/features/partner/operator-court-match";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function OperatorCourtMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  await requireOperatorPage(`/partner/court-matches/${encodeURIComponent(matchId)}`);
  return <OperatorCourtMatchDetail matchId={matchId} />;
}
