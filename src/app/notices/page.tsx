import { MAnnouncements } from "@/features/profile/m-announcements";
import { requireOnboardedPage } from "@/server/auth/require-onboarded-page";

export default async function NoticesPage() {
  await requireOnboardedPage("/notices");
  return <MAnnouncements />;
}
