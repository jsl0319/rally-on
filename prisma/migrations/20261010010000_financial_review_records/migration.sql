CREATE TYPE "CourtFinancialReviewAction" AS ENUM ('RECONCILE', 'HOLD', 'RELEASE_HOLD');
CREATE TYPE "CourtFinancialDataScope" AS ENUM ('DEPOSITOR_NAME', 'REFUND_ACCOUNT', 'REFUND_ATTEMPTS', 'MATCH_ACCOUNT');
CREATE TABLE "court_financial_reviews" (
  "id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "client_request_id" UUID NOT NULL,
  "action" "CourtFinancialReviewAction" NOT NULL,
  "request_fingerprint" VARCHAR(64) NOT NULL,
  "state_fingerprint" VARCHAR(64) NOT NULL,
  "scopes" "CourtFinancialDataScope"[] NOT NULL,
  "reason" VARCHAR(500),
  "case_reference" VARCHAR(100),
  "review_due_at" TIMESTAMPTZ(6),
  "releases_review_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "court_financial_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_review_shape" CHECK (
    (action = 'RECONCILE' AND cardinality(scopes) = 0 AND reason IS NULL AND case_reference IS NULL AND review_due_at IS NULL AND releases_review_id IS NULL)
    OR (action = 'HOLD' AND cardinality(scopes) > 0 AND reason IS NOT NULL AND case_reference IS NOT NULL AND review_due_at IS NOT NULL AND releases_review_id IS NULL)
    OR (action = 'RELEASE_HOLD' AND cardinality(scopes) = 0 AND reason IS NOT NULL AND case_reference IS NULL AND review_due_at IS NULL AND releases_review_id IS NOT NULL)
  ),
  CONSTRAINT "court_financial_reviews_application_id_fkey" FOREIGN KEY (application_id) REFERENCES match_applications(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "court_financial_reviews_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "court_financial_reviews_releases_review_id_fkey" FOREIGN KEY (releases_review_id) REFERENCES court_financial_reviews(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "court_financial_reviews_application_id_client_request_id_key" ON court_financial_reviews(application_id, client_request_id);
CREATE UNIQUE INDEX "court_financial_reviews_releases_review_id_key" ON court_financial_reviews(releases_review_id);
CREATE INDEX "court_financial_reviews_application_id_created_at_idx" ON court_financial_reviews(application_id, created_at);
