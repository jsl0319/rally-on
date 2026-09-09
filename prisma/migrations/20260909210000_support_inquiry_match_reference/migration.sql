-- 코트 매칭의 입금·환불 문의는 어느 건인지 특정할 수 있어야 되묻지 않고 처리할 수 있다.
-- 일반 문의는 비어 있다.
ALTER TABLE "support_inquiries" ADD COLUMN "match_id" UUID;

ALTER TABLE "support_inquiries"
  ADD CONSTRAINT "support_inquiries_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "support_inquiries_match_id_created_at_idx" ON "support_inquiries"("match_id", "created_at" DESC);
