import { OperatorSettlementAccount } from "@/features/partner/operator-settlement-account";
import { requireActivePage } from "@/server/auth/require-onboarded-page";

export default async function OperatorSettlementAccountPage() {
  await requireActivePage("/partner/settlement-account");
  return <OperatorSettlementAccount />;
}
