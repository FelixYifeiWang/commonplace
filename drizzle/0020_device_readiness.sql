ALTER TABLE devices ADD COLUMN ready_at TEXT;
--> statement-breakpoint
-- Preserve established installations. An unacknowledged claim is still setup.
UPDATE devices SET ready_at=COALESCE(last_seen,created_at)
WHERE last_seen IS NOT NULL
   OR NOT EXISTS (SELECT 1 FROM pairing_codes p WHERE p.claim_id=devices.id AND p.ready_at IS NULL)
   OR EXISTS (SELECT 1 FROM pairing_codes p WHERE p.claim_id=devices.id AND p.ready_at IS NOT NULL);
