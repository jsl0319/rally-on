import { ServiceAdmin } from "@/features/admin/service-admin";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";
export default async function Page() {
  await requireInternalReviewerPage("/internal");
  return <ServiceAdmin />;
}
