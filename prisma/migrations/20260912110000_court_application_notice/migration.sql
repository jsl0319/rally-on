-- AlterTable
ALTER TABLE "match_applications" ADD COLUMN     "court_notice_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "court_notice_snapshot" JSONB,
ADD COLUMN     "court_notice_version" VARCHAR(64);
