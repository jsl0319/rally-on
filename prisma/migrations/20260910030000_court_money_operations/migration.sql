-- CreateEnum
CREATE TYPE "SupportMessageVisibility" AS ENUM ('PUBLIC', 'OPERATOR');

-- CreateEnum
CREATE TYPE "CourtRefundStatus" AS ENUM ('PROCESSING', 'PAID', 'FAILED', 'REVIEW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupportInquiryStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "SupportInquiryStatus" ADD VALUE 'WAITING_OPERATOR';
ALTER TYPE "SupportInquiryStatus" ADD VALUE 'RESOLVED';

-- AlterTable
ALTER TABLE "support_inquiries" ADD COLUMN     "application_id" UUID,
ADD COLUMN     "assignee_user_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "match_applications" ADD COLUMN     "confirmation_due_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_received_at" TIMESTAMPTZ(6),
ADD COLUMN     "legacy_refund_paid_krw" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "receipt_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "received_amount_krw" INTEGER,
ADD COLUMN     "refund_account_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "support_inquiry_messages" (
    "id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL DEFAULT 'REPLY',
    "visibility" "SupportMessageVisibility" NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_inquiry_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_receipt_records" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previous_amount_krw" INTEGER NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(6),
    "note" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_receipt_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_refund_attempts" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "bank" VARCHAR(50) NOT NULL,
    "account_number" VARCHAR(40) NOT NULL,
    "account_holder" VARCHAR(50) NOT NULL,
    "account_version" INTEGER NOT NULL,
    "status" "CourtRefundStatus" NOT NULL DEFAULT 'PROCESSING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "transferred_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "court_refund_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_refund_events" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "status" "CourtRefundStatus" NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "transferred_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_refund_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_inquiry_messages_inquiry_id_created_at_idx" ON "support_inquiry_messages"("inquiry_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_inquiry_messages_inquiry_id_client_request_id_key" ON "support_inquiry_messages"("inquiry_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_receipt_records_application_id_client_request_id_key" ON "court_receipt_records"("application_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_receipt_records_application_id_version_key" ON "court_receipt_records"("application_id", "version");

-- CreateIndex
CREATE INDEX "court_refund_attempts_application_id_created_at_idx" ON "court_refund_attempts"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "court_refund_attempts_status_updated_at_idx" ON "court_refund_attempts"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "court_refund_attempts_application_id_client_request_id_key" ON "court_refund_attempts"("application_id", "client_request_id");

-- CreateIndex
CREATE INDEX "court_refund_events_attempt_id_created_at_idx" ON "court_refund_events"("attempt_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "court_refund_events_attempt_id_client_request_id_key" ON "court_refund_events"("attempt_id", "client_request_id");

-- CreateIndex
CREATE INDEX "support_inquiries_status_updated_at_idx" ON "support_inquiries"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "support_inquiries" ADD CONSTRAINT "support_inquiries_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inquiries" ADD CONSTRAINT "support_inquiries_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "match_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inquiry_messages" ADD CONSTRAINT "support_inquiry_messages_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "support_inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_inquiry_messages" ADD CONSTRAINT "support_inquiry_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_receipt_records" ADD CONSTRAINT "court_receipt_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "match_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_receipt_records" ADD CONSTRAINT "court_receipt_records_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_refund_attempts" ADD CONSTRAINT "court_refund_attempts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "match_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_refund_attempts" ADD CONSTRAINT "court_refund_attempts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_refund_events" ADD CONSTRAINT "court_refund_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "court_refund_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_refund_events" ADD CONSTRAINT "court_refund_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing confirmed receipts are historical assertions; never invent a bank transaction time.
UPDATE match_applications a SET received_amount_krw = COALESCE(m.total_court_fee_krw, 0),
 legacy_refund_paid_krw = CASE WHEN a.refund_completed_at IS NOT NULL
   THEN COALESCE(a.refund_amount_krw, m.total_court_fee_krw, 0) ELSE 0 END
FROM matches m WHERE a.match_id = m.id AND m.court_source = 'PARTNER_COURT' AND a.confirmed_at IS NOT NULL;
UPDATE support_inquiries SET updated_at = created_at;
UPDATE support_inquiries s SET application_id = a.id FROM match_applications a
WHERE s.match_id = a.match_id AND s.user_id = a.applicant_user_id;
ALTER TABLE match_applications ADD CONSTRAINT court_money_amounts_nonnegative CHECK (
 (received_amount_krw IS NULL OR received_amount_krw >= 0) AND legacy_refund_paid_krw >= 0 AND receipt_version >= 0 AND refund_account_version > 0);
ALTER TABLE court_receipt_records ADD CONSTRAINT receipt_amounts_nonnegative CHECK (amount_krw >= 0 AND previous_amount_krw >= 0 AND version > 0);
ALTER TABLE court_refund_attempts ADD CONSTRAINT refund_positive_amount CHECK (amount_krw > 0 AND version > 0 AND account_version > 0);
CREATE UNIQUE INDEX court_refund_one_active_per_application ON court_refund_attempts(application_id)
WHERE status IN ('PROCESSING', 'REVIEW');
