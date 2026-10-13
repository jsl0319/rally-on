import { notFound } from "next/navigation";
import { z } from "zod";
import { AnnouncementEditor } from "@/features/admin/announcement-editor";
import { requireInternalReviewerPage } from "@/server/auth/require-onboarded-page";
export default async function Page({ params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = await params;
  await requireInternalReviewerPage(`/internal/announcements/${announcementId}`);
  if (!z.uuid().safeParse(announcementId).success) notFound();
  return <AnnouncementEditor key={announcementId} announcementId={announcementId} />;
}
