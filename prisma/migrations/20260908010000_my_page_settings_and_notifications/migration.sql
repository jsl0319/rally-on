CREATE TYPE "NotificationType" AS ENUM ('APPLICATION_RECEIVED', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED');
CREATE TYPE "SupportInquiryStatus" AS ENUM ('OPEN', 'ANSWERED');

ALTER TABLE "users" ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6), ADD COLUMN "match_notifications_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" VARCHAR(80) NOT NULL,
  "body" VARCHAR(200) NOT NULL,
  "href" VARCHAR(255),
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcements" (
  "id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_inquiries" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "status" "SupportInquiryStatus" NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at" DESC);
CREATE INDEX "support_inquiries_user_id_created_at_idx" ON "support_inquiries"("user_id", "created_at" DESC);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_inquiries" ADD CONSTRAINT "support_inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
