CREATE TYPE "MatchGameType" AS ENUM ('MIXED_DOUBLES', 'MENS_DOUBLES', 'WOMENS_DOUBLES', 'SINGLES', 'RALLY', 'OTHER');
ALTER TABLE "matches"
  ADD COLUMN "game_type" "MatchGameType",
  ADD COLUMN "settlement_bank" VARCHAR(50),
  ADD COLUMN "settlement_account_number" VARCHAR(40),
  ADD COLUMN "settlement_account_holder" VARCHAR(50);
ALTER TABLE "matches" ADD CONSTRAINT "matches_settlement_account_complete" CHECK (
  ("settlement_bank" IS NULL AND "settlement_account_number" IS NULL AND "settlement_account_holder" IS NULL)
  OR ("settlement_bank" IS NOT NULL AND "settlement_account_number" IS NOT NULL AND "settlement_account_holder" IS NOT NULL)
);
