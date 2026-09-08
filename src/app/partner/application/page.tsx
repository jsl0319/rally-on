import { OperatorApplicationStatus } from "@/features/partner/operator-application-status";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function PartnerApplicationStatusPage() {
  await requireOperatorPage("/partner/application");
  return <OperatorApplicationStatus />;
}
