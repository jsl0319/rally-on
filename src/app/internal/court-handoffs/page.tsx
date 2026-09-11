import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";
import { CourtHandoffDashboard } from "@/features/support/court-handoff-dashboard";
export default async function CourtHandoffPage() {
  await requireInternalReviewerPage("/internal/court-handoffs");
  return <CourtHandoffDashboard />;
}
