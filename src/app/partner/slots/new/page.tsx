import { OperatorSlotForm } from "@/features/partner/operator-time-management";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function PartnerSlotNewPage() {
  await requireOperatorPage("/partner/slots/new");
  return <OperatorSlotForm />;
}
