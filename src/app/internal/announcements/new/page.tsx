import { AnnouncementEditor } from "@/features/admin/announcement-editor";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";
export default async function Page() {
  await requireInternalReviewerPage("/internal/announcements/new");
  return <AnnouncementEditor />;
}
