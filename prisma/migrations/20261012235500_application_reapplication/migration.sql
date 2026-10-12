-- Reapplication creates a new record; never overwrite payment/refund history.
DROP INDEX "match_applications_match_id_applicant_user_id_key";
CREATE UNIQUE INDEX "match_applications_current_applicant_key"
  ON "match_applications" ("match_id", "applicant_user_id")
  WHERE "status" <> 'WITHDRAWN';
CREATE INDEX "match_applications_match_id_applicant_user_id_created_at_idx"
  ON "match_applications" ("match_id", "applicant_user_id", "created_at" DESC);
