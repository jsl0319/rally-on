import { OperatorContact } from "@/features/partner/operator-contact";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function OperatorContactPage() {
  await requireOperatorPage("/partner/contact");
  return <OperatorContact />;
}
