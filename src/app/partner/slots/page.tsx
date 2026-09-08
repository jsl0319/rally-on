import { OperatorSlotList } from "@/features/partner/operator-time-management";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function PartnerSlotsPage() {
  await requireOperatorPage("/partner/slots");
  return <OperatorSlotList />;
}
