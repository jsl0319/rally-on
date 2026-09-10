import Link from "next/link";
import { InternalOperatorApplicationReview } from "@/features/internal/operator-application-review";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";

export default async function InternalOperatorApplicationsPage() {
  await requireInternalReviewerPage("/internal/operator-applications");
  return <><Link className="block bg-white px-5 py-4 text-sm font-semibold text-blue-600" href="/internal/support-inquiries">1:1 문의 처리 →</Link><InternalOperatorApplicationReview /></>;
}
