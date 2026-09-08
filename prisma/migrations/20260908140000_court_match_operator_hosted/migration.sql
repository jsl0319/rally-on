-- 코트 매칭을 운영자 주최 모델로 바꾸기 위한 컬럼 추가.
-- 참고: docs/03-2-court-match-operator-hosted-redesign.md

-- 새 참가 상태. 같은 트랜잭션 안에서 사용하지 않으므로 여기서 추가해도 안전하다.
ALTER TYPE "ApplicationStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'EXPIRED_UNPAID';

-- 참가 승인 방식
CREATE TYPE "CourtSlotApprovalMode" AS ENUM ('AUTO', 'OPERATOR');

-- 운영자 입금 계좌. 시설당 한 벌만 두고, 코트 매칭 공개 시 Match로 스냅샷을 복사한다.
ALTER TABLE "courts"
  ADD COLUMN "settlement_bank" VARCHAR(50),
  ADD COLUMN "settlement_account_number" VARCHAR(40),
  ADD COLUMN "settlement_account_holder" VARCHAR(50);

-- 운영자가 정하는 모집 조건
ALTER TABLE "court_slots"
  ADD COLUMN "min_participant_count" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "game_type" "MatchGameType",
  ADD COLUMN "male_capacity" INTEGER,
  ADD COLUMN "female_capacity" INTEGER,
  ADD COLUMN "approval_mode" "CourtSlotApprovalMode" NOT NULL DEFAULT 'AUTO';

-- 기존 행은 max_participant_count가 2 이상이므로 기본값 2가 이 제약을 위반하지 않는다.
ALTER TABLE "court_slots" ADD CONSTRAINT "court_slots_participant_count_valid" CHECK (
  "min_participant_count" >= 1
  AND "min_participant_count" <= "max_participant_count"
);

ALTER TABLE "court_slots" ADD CONSTRAINT "court_slots_gender_capacity_valid" CHECK (
  ("male_capacity" IS NULL AND "female_capacity" IS NULL)
  OR ("male_capacity" IS NOT NULL AND "female_capacity" IS NOT NULL
      AND "male_capacity" >= 0 AND "female_capacity" >= 0
      AND "male_capacity" + "female_capacity" = "max_participant_count"
      AND ("game_type" <> 'MENS_DOUBLES' OR "female_capacity" = 0)
      AND ("game_type" <> 'WOMENS_DOUBLES' OR "male_capacity" = 0))
);

-- 계좌이체 입금·환불 기록. 서비스는 송금을 대행하거나 확인하지 않고 기록만 남긴다.
ALTER TABLE "match_applications"
  ADD COLUMN "deposit_code" VARCHAR(8),
  ADD COLUMN "payment_due_at" TIMESTAMPTZ(6),
  ADD COLUMN "depositor_name" VARCHAR(50),
  ADD COLUMN "deposit_claimed_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "refund_bank" VARCHAR(50),
  ADD COLUMN "refund_account_number" VARCHAR(40),
  ADD COLUMN "refund_account_holder" VARCHAR(50),
  ADD COLUMN "refund_requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "refund_completed_at" TIMESTAMPTZ(6);

-- 같은 코트 매칭 안에서 식별코드가 겹치지 않게 한다(NULL은 서로 다른 값으로 취급된다).
CREATE UNIQUE INDEX "match_applications_match_id_deposit_code_key"
  ON "match_applications" ("match_id", "deposit_code");
