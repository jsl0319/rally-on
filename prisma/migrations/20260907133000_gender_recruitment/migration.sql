CREATE TYPE "ProfileGender" AS ENUM ('MALE', 'FEMALE');
ALTER TABLE "tennis_profiles" ADD COLUMN "gender" "ProfileGender";
ALTER TABLE "match_applications" ADD COLUMN "applicant_gender" "ProfileGender";
ALTER TABLE "matches" ADD COLUMN "male_recruit_count" INTEGER, ADD COLUMN "female_recruit_count" INTEGER;
ALTER TABLE "matches" ADD CONSTRAINT "matches_gender_recruitment_valid" CHECK (
  ("male_recruit_count" IS NULL AND "female_recruit_count" IS NULL)
  OR ("male_recruit_count" IS NOT NULL AND "female_recruit_count" IS NOT NULL
      AND "male_recruit_count" >= 0 AND "female_recruit_count" >= 0
      AND "male_recruit_count" + "female_recruit_count" = "recruit_count"
      AND ("game_type" <> 'MENS_DOUBLES' OR "female_recruit_count" = 0)
      AND ("game_type" <> 'WOMENS_DOUBLES' OR "male_recruit_count" = 0))
);
