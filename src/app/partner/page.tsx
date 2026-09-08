import { OperatorDashboard } from "@/features/partner/operator-time-management";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function PartnerHomePage() {
  await requireOperatorPage("/partner");
  return <OperatorDashboard />;
}
