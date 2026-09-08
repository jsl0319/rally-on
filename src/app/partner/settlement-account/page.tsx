import { OperatorSettlementAccount } from "@/features/partner/operator-settlement-account";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function OperatorSettlementAccountPage() {
  await requireOperatorPage("/partner/settlement-account");
  return <OperatorSettlementAccount />;
}
