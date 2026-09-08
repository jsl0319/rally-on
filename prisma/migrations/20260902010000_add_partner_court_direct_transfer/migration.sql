-- Reconstructed migration: this was already applied to the shared database
-- (its objects are not referenced by the current schema.prisma or any app
-- code) but the original migration file never made it into this repo on any
-- branch. Rebuilt from `prisma db pull` + `pg_get_constraintdef` introspection
-- of the live database on 2026-09-08 so local migration history matches
-- reality. Not intended to introduce or change behavior.

ALTER TYPE "ApplicationStatus" ADD VALUE 'PAYMENT_PENDING';

CREATE TYPE "PartnerCourtParticipationRole" AS ENUM ('HOST', 'PARTICIPANT');
CREATE TYPE "PartnerCourtParticipationStatus" AS ENUM ('TRANSFER_REQUESTED', 'TRANSFER_REPORTED', 'CONFIRMED', 'TRANSFER_EXPIRED', 'CANCELLED', 'REFUND_PENDING', 'REFUND_SENT', 'REFUND_RECEIVED');
CREATE TYPE "PartnerCourtSessionStatus" AS ENUM ('AWAITING_HOST_TRANSFER', 'RECRUITING', 'MINIMUM_CONFIRMED', 'MINIMUM_UNMET', 'CANCELLED');

ALTER TABLE "court_operator_applications" ADD COLUMN "direct_transfer_policy_version" VARCHAR(40), ADD COLUMN "direct_transfer_policy_accepted_at" TIMESTAMPTZ(6);

ALTER TABLE "court_slots" ADD COLUMN "participant_fee_krw" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "minimum_participant_count" INTEGER NOT NULL DEFAULT 2, ADD COLUMN "included_items" VARCHAR(300), ADD COLUMN "refund_policy_version" VARCHAR(40) NOT NULL DEFAULT 'DIRECT_TRANSFER_V1';

CREATE TABLE "operator_transfer_accounts" (
  "id" UUID NOT NULL,
  "operator_application_id" UUID NOT NULL,
  "bank_name" VARCHAR(40) NOT NULL,
  "account_holder" VARCHAR(100) NOT NULL,
  "account_number_ciphertext" VARCHAR(1200) NOT NULL,
  "account_number_last4" VARCHAR(4) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "operator_transfer_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_court_sessions" (
  "id" UUID NOT NULL,
  "match_id" UUID NOT NULL,
  "operator_application_id" UUID NOT NULL,
  "status" "PartnerCourtSessionStatus" NOT NULL DEFAULT 'AWAITING_HOST_TRANSFER',
  "participant_fee_krw" INTEGER NOT NULL,
  "minimum_participant_count" INTEGER NOT NULL,
  "maximum_participant_count" INTEGER NOT NULL,
  "minimum_decision_at" TIMESTAMPTZ(6) NOT NULL,
  "refund_policy_version" VARCHAR(40) NOT NULL,
  "host_transfer_deadline_at" TIMESTAMPTZ(6) NOT NULL,
  "minimum_confirmed_at" TIMESTAMPTZ(6),
  "minimum_unmet_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "partner_court_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_court_sessions_participant_counts_check" CHECK (("minimum_participant_count" >= 2) AND ("minimum_participant_count" <= "maximum_participant_count")),
  CONSTRAINT "partner_court_sessions_participant_fee_krw_check" CHECK ("participant_fee_krw" >= 0)
);

CREATE TABLE "partner_court_participations" (
  "id" UUID NOT NULL,
  "partner_court_session_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "application_id" UUID,
  "role" "PartnerCourtParticipationRole" NOT NULL,
  "status" "PartnerCourtParticipationStatus" NOT NULL DEFAULT 'TRANSFER_REQUESTED',
  "amount_krw" INTEGER NOT NULL,
  "transfer_deadline_at" TIMESTAMPTZ(6) NOT NULL,
  "transfer_reported_at" TIMESTAMPTZ(6),
  "confirmed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "refund_rate_bps" INTEGER,
  "refund_requested_at" TIMESTAMPTZ(6),
  "refund_sent_at" TIMESTAMPTZ(6),
  "refund_received_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "partner_court_participations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_court_participations_amount_krw_check" CHECK ("amount_krw" >= 0),
  CONSTRAINT "partner_court_participations_refund_rate_bps_check" CHECK (("refund_rate_bps" IS NULL) OR ("refund_rate_bps" = ANY (ARRAY[0, 5000, 10000])))
);

CREATE UNIQUE INDEX "operator_transfer_accounts_operator_application_id_key" ON "operator_transfer_accounts"("operator_application_id");
CREATE UNIQUE INDEX "partner_court_sessions_match_id_key" ON "partner_court_sessions"("match_id");
CREATE INDEX "partner_court_sessions_operator_application_id_status_idx" ON "partner_court_sessions"("operator_application_id", "status");
CREATE INDEX "partner_court_sessions_status_minimum_decision_at_idx" ON "partner_court_sessions"("status", "minimum_decision_at");
CREATE UNIQUE INDEX "partner_court_participations_application_id_key" ON "partner_court_participations"("application_id");
CREATE UNIQUE INDEX "partner_court_participations_partner_court_session_id_user_id_k" ON "partner_court_participations"("partner_court_session_id", "user_id");
CREATE INDEX "partner_court_participations_partner_court_session_id_status_id" ON "partner_court_participations"("partner_court_session_id", "status");
CREATE INDEX "partner_court_participations_user_id_status_created_at_idx" ON "partner_court_participations"("user_id", "status", "created_at" DESC);

ALTER TABLE "operator_transfer_accounts" ADD CONSTRAINT "operator_transfer_accounts_operator_application_id_fkey" FOREIGN KEY ("operator_application_id") REFERENCES "court_operator_applications"("id") ON UPDATE CASCADE;
ALTER TABLE "partner_court_sessions" ADD CONSTRAINT "partner_court_sessions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON UPDATE CASCADE;
ALTER TABLE "partner_court_sessions" ADD CONSTRAINT "partner_court_sessions_operator_application_id_fkey" FOREIGN KEY ("operator_application_id") REFERENCES "court_operator_applications"("id") ON UPDATE CASCADE;
ALTER TABLE "partner_court_participations" ADD CONSTRAINT "partner_court_participations_partner_court_session_id_fkey" FOREIGN KEY ("partner_court_session_id") REFERENCES "partner_court_sessions"("id") ON UPDATE CASCADE;
ALTER TABLE "partner_court_participations" ADD CONSTRAINT "partner_court_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE;
ALTER TABLE "partner_court_participations" ADD CONSTRAINT "partner_court_participations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "match_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
