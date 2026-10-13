import { AnnouncementManager } from "@/features/admin/announcement-manager";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";
export default async function Page() {
  await requireInternalReviewerPage("/internal/announcements");
  return <AnnouncementManager />;
}
