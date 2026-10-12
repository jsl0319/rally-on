ALTER TABLE court_slots ADD COLUMN ball_discount_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE court_slots ADD CONSTRAINT court_ball_price CHECK (NOT ball_discount_enabled OR price_krw > 5000);
ALTER TABLE match_applications
 ADD COLUMN court_fee_krw INTEGER,
 ADD COLUMN brings_balls BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN balls_missing_at TIMESTAMPTZ(6),
 ADD COLUMN balls_missing_by UUID,
 ADD COLUMN balls_missing_request_id UUID,
 ADD COLUMN balls_missing_note VARCHAR(500);
ALTER TABLE match_applications ADD CONSTRAINT court_ball_fee CHECK (
 (court_fee_krw IS NULL OR court_fee_krw >= 0)
 AND (NOT brings_balls OR (court_fee_krw IS NOT NULL AND court_fee_krw > 0))
 AND ((balls_missing_at IS NULL AND balls_missing_by IS NULL AND balls_missing_request_id IS NULL AND balls_missing_note IS NULL)
 OR (brings_balls AND balls_missing_at IS NOT NULL AND balls_missing_by IS NOT NULL AND balls_missing_request_id IS NOT NULL AND balls_missing_note IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_ball_bringer_per_match ON match_applications(match_id)
 WHERE brings_balls AND status IN ('PENDING', 'ACCEPTED', 'CONFIRMED');
