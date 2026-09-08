import { MNotifications } from "@/features/profile/m-notifications";
import { requireOnboardedPage } from "@/server/auth/require-onboarded-page";

export default async function MyNotificationsPage() {
  await requireOnboardedPage("/my/notifications");
  return <MNotifications />;
}
