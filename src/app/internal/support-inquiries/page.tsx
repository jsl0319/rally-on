import { SupportQueue } from "@/features/support/support-queue";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";
export default async function Page() {
  await requireInternalReviewerPage("/internal/support-inquiries");
  return <SupportQueue audience="reviewer" />;
}
