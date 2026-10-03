-- No historical phone numbers are inferred or copied from review data.
ALTER TABLE "courts"
  ADD COLUMN "operator_contact_phone" VARCHAR(12),
  ADD COLUMN "operator_contact_hours" VARCHAR(80),
  ADD COLUMN "contact_published_at" TIMESTAMPTZ(6),
  ADD COLUMN "contact_version" INTEGER NOT NULL DEFAULT 0;
