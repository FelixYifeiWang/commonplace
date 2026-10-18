ALTER TABLE `stories` ADD `session_json` text;
--> statement-breakpoint
ALTER TABLE `stories` ADD `session_model` text;
--> statement-breakpoint
-- Existing beats remain readable until their new view is ready.
UPDATE `stories` SET revision=revision+1, checkpoint='{"turnSequence":0,"turnOffset":0,"items":{}}', status='pending', next_attempt_at=0 WHERE collection_id IN (SELECT id FROM collections WHERE deleted_at IS NULL);
