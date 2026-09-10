-- Separate on-time fee receipt from later excess/duplicate transfers.
ALTER TABLE match_applications ADD COLUMN fee_received_at TIMESTAMPTZ(6);
ALTER TABLE court_receipt_records ADD COLUMN fee_received_at TIMESTAMPTZ(6);
UPDATE match_applications a SET fee_received_at = a.last_received_at FROM matches m
WHERE a.match_id = m.id AND a.received_amount_krw >= COALESCE(m.total_court_fee_krw, 0);
