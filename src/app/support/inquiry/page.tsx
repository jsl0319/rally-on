import { MSupportInquiry } from "@/features/profile/m-support-inquiry";
import { requireOnboardedPage } from "@/server/auth/require-onboarded-page";

export default async function SupportInquiryPage() {
  await requireOnboardedPage("/support/inquiry");
  return <MSupportInquiry />;
}
