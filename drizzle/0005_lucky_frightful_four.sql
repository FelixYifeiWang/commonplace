CREATE TABLE `stories` (
	`collection_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`processed_revision` integer DEFAULT 0 NOT NULL,
	`checkpoint` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_beats` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`connections` text NOT NULL,
	`evidence` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `story_beats_order` ON `story_beats` (`collection_id`,`position`);
--> statement-breakpoint
-- Durable coalescing queue: a committed source change also queues its story.
CREATE TRIGGER story_collection_added AFTER INSERT ON collections BEGIN
 INSERT INTO stories(collection_id,owner_id,updated_at) VALUES(NEW.id,NEW.owner_id,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER story_collection_restored AFTER UPDATE OF deleted_at ON collections WHEN NEW.deleted_at IS NULL BEGIN
 UPDATE stories SET revision=revision+1, next_attempt_at=0, status='pending', error=NULL WHERE collection_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER story_item_added AFTER INSERT ON items BEGIN
 INSERT INTO stories(collection_id,owner_id,updated_at,next_attempt_at) VALUES(NEW.collection_id,NEW.owner_id,NEW.updated_at,CAST(strftime('%s','now') AS INTEGER)*1000+8000)
 ON CONFLICT(collection_id) DO UPDATE SET revision=revision+1,next_attempt_at=excluded.next_attempt_at,status= CASE WHEN status='generating' THEN status ELSE 'pending' END;
END;
--> statement-breakpoint
CREATE TRIGGER story_item_changed AFTER UPDATE OF title,body,url,kind,deleted_at ON items
 WHEN NEW.title IS NOT OLD.title OR NEW.body IS NOT OLD.body OR NEW.url IS NOT OLD.url OR NEW.kind IS NOT OLD.kind OR NEW.deleted_at IS NOT OLD.deleted_at BEGIN
 UPDATE stories SET revision=revision+1,next_attempt_at=CAST(strftime('%s','now') AS INTEGER)*1000+8000,status= CASE WHEN status='generating' THEN status ELSE 'pending' END WHERE collection_id=NEW.collection_id;
END;
--> statement-breakpoint
CREATE TRIGGER story_item_removed AFTER DELETE ON items BEGIN
 UPDATE stories SET revision=revision+1,next_attempt_at=CAST(strftime('%s','now') AS INTEGER)*1000+8000,status= CASE WHEN status='generating' THEN status ELSE 'pending' END WHERE collection_id=OLD.collection_id;
END;
--> statement-breakpoint
CREATE TRIGGER story_turn_added AFTER INSERT ON turns BEGIN
 INSERT INTO stories(collection_id,owner_id,updated_at,next_attempt_at)
 SELECT collection_id,NEW.owner_id,NEW.created_at,CAST(strftime('%s','now') AS INTEGER)*1000+8000 FROM sessions WHERE id=NEW.session_id
 ON CONFLICT(collection_id) DO UPDATE SET revision=revision+1,next_attempt_at=excluded.next_attempt_at,status= CASE WHEN status='generating' THEN status ELSE 'pending' END;
END;
--> statement-breakpoint
INSERT INTO stories(collection_id,owner_id,updated_at) SELECT id,owner_id,created_at FROM collections WHERE deleted_at IS NULL;
