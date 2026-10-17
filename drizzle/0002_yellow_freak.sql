ALTER TABLE `items` ADD `preview_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `items` ADD `embed_url` text;--> statement-breakpoint
INSERT INTO collections (id, owner_id, name, description, created_at)
SELECT 'session-' || id, owner_id, title, '', created_at FROM sessions
WHERE NOT EXISTS (SELECT 1 FROM collections c WHERE c.id = 'session-' || sessions.id);
--> statement-breakpoint
UPDATE items SET collection_id = 'session-' || session_id WHERE session_id IS NOT NULL;
--> statement-breakpoint
UPDATE sessions SET collection_id = 'session-' || id;
--> statement-breakpoint
DELETE FROM collections WHERE name = 'Collected thoughts' AND NOT EXISTS (SELECT 1 FROM items WHERE items.collection_id = collections.id) AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.collection_id = collections.id);
--> statement-breakpoint
UPDATE items SET preview_status = 'ready' WHERE url IS NULL;
--> statement-breakpoint
UPDATE items SET body = '' WHERE body = 'A reference mentioned in your conversation.';
