import { InternalOperatorApplicationReview } from "@/features/internal/operator-application-review";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";

export default async function InternalOperatorApplicationsPage() {
  await requireInternalReviewerPage("/internal/operator-applications");
  return <InternalOperatorApplicationReview />;
}
