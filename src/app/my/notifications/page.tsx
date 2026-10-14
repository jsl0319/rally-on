import { getCurrentUser } from "@/server/auth/current-user";
import { MNotifications } from "@/features/profile/m-notifications";
import { requireActivePage } from "@/server/auth/require-onboarded-page";

export default async function MyNotificationsPage() {
  await requireActivePage("/my/notifications");
  const user = await getCurrentUser();
  return <MNotifications backHref={user.onboardingCompletedAt ? "/my" : "/partner"} />;
}
