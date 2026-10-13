ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_INQUIRY_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_INQUIRY_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_INQUIRY_REPLIED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_INQUIRY_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_OPERATOR_REQUESTED';
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');
-- Preserve existing published notices; new records start as drafts.
ALTER TABLE "announcements"
  ADD COLUMN "status" "AnnouncementStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_by_user_id" UUID,
  ADD COLUMN "updated_by_user_id" UUID,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "published_at" DROP NOT NULL,
  ALTER COLUMN "published_at" DROP DEFAULT;
ALTER TABLE "announcements" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
CREATE INDEX "announcements_status_is_pinned_published_at_idx" ON "announcements"("status", "is_pinned", "published_at" DESC);
ALTER TABLE "announcements" ADD CONSTRAINT "published_announcement_has_date" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);
