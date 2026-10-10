ALTER TYPE "NotificationType" ADD VALUE 'COURT_REFUND_AGREEMENT_RECORDED';
ALTER TABLE "match_applications"
  ADD COLUMN "agreed_refund_amount_krw" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refund_agreement_version" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "match_application_agreement_nonnegative" CHECK ("agreed_refund_amount_krw" >= 0 AND "refund_agreement_version" >= 0);
CREATE TABLE "court_refund_agreements" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "client_request_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "previous_amount_krw" INTEGER NOT NULL,
  "amount_krw" INTEGER NOT NULL,
  "incident_at" TIMESTAMPTZ(6) NOT NULL,
  "note" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "court_refund_agreements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "court_refund_agreements_amount_check" CHECK ("amount_krw" > "previous_amount_krw" AND "previous_amount_krw" >= 0 AND "version" > 0),
  CONSTRAINT "court_refund_agreements_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "match_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "court_refund_agreements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "court_refund_agreements_application_id_client_request_id_key" ON "court_refund_agreements"("application_id", "client_request_id");
CREATE UNIQUE INDEX "court_refund_agreements_application_id_version_key" ON "court_refund_agreements"("application_id", "version");
