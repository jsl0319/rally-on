-- 참가자가 스스로 참가를 취소할 수 있게 한다.
-- 취소 시각과 그때 확정한 환불 금액을 남긴다. 금액은 취소 시점의 참가비와 남은
-- 일수로 계산한 스냅샷이라, 나중에 참가비가 바뀌어도 이미 취소된 건은 흔들리지 않는다.
-- 기존 행의 refund_amount_krw는 NULL이며 전액 환불을 뜻한다(앱 사유 취소).
ALTER TABLE "match_applications"
  ADD COLUMN "participant_cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "refund_amount_krw" INTEGER;

ALTER TABLE "match_applications"
  ADD CONSTRAINT "match_applications_refund_amount_krw_check" CHECK ("refund_amount_krw" IS NULL OR "refund_amount_krw" >= 0);

-- 참가자 취소는 운영자가 바로 알아야 환불 대상인지 확인할 수 있다.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COURT_MATCH_PARTICIPANT_CANCELLED';
