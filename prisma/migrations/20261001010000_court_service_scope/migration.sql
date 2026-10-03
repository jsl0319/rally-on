-- Preserve existing slots and application notices; never infer historical inclusions.
ALTER TABLE "court_slots" ADD COLUMN "service_scope" JSONB;
