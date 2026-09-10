import { SupportQueue } from "@/features/support/support-queue";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";
export default async function Page() {
  await requireOperatorPage("/partner/support-inquiries");
  return <SupportQueue audience="operator" />;
}
