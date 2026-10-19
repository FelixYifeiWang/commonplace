-- A transient authorization row exists only inside its capture transaction.
CREATE TABLE capture_checks(session_id text PRIMARY KEY NOT NULL,owner_id text NOT NULL);
--> statement-breakpoint
CREATE TRIGGER capture_check BEFORE INSERT ON capture_checks BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions s JOIN collections c ON c.id=s.collection_id
 WHERE s.id=NEW.session_id AND s.owner_id=NEW.owner_id AND c.owner_id=NEW.owner_id
 AND s.state NOT IN ('paused','revoked') AND c.deleted_at IS NULL AND c.frozen_at IS NULL)
 THEN RAISE(ABORT,'CAPTURE_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER session_pausing AFTER UPDATE OF state ON sessions
WHEN NEW.state='paused' AND OLD.state!='paused' BEGIN
 UPDATE stories SET lease_token=NULL,lease_until=0,status='pending' WHERE collection_id=NEW.collection_id;
END;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN activity_key text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE stories ADD COLUMN publish_after integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE blob_deletions(file_key text PRIMARY KEY NOT NULL,owner_id text NOT NULL,not_before integer NOT NULL,status text NOT NULL DEFAULT 'pending',lease_until integer NOT NULL DEFAULT 0,attempts integer NOT NULL DEFAULT 0,last_error text);
--> statement-breakpoint
CREATE TRIGGER removed_item_file AFTER DELETE ON items WHEN OLD.file_key IS NOT NULL BEGIN
 INSERT INTO blob_deletions(file_key,owner_id,not_before) VALUES(OLD.file_key,OLD.owner_id,CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(file_key) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER replaced_item_file AFTER UPDATE OF file_key ON items WHEN OLD.file_key IS NOT NULL AND OLD.file_key IS NOT NEW.file_key BEGIN
 INSERT INTO blob_deletions(file_key,owner_id,not_before) VALUES(OLD.file_key,OLD.owner_id,CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(file_key) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER deleting_file_no_insert BEFORE INSERT ON items WHEN EXISTS(SELECT 1 FROM blob_deletions WHERE file_key=NEW.file_key AND status='deleting') BEGIN
 SELECT RAISE(ABORT,'This file is being permanently removed. Upload it again.');
END;
--> statement-breakpoint
CREATE TRIGGER deleting_file_no_update BEFORE UPDATE OF file_key ON items WHEN NEW.file_key IS NOT OLD.file_key AND EXISTS(SELECT 1 FROM blob_deletions WHERE file_key=NEW.file_key AND status='deleting') BEGIN
 SELECT RAISE(ABORT,'This file is being permanently removed. Upload it again.');
END;
--> statement-breakpoint
CREATE TRIGGER referenced_file_added AFTER INSERT ON items WHEN NEW.file_key IS NOT NULL BEGIN
 DELETE FROM blob_deletions WHERE file_key=NEW.file_key AND status='pending';
END;
--> statement-breakpoint
CREATE TRIGGER referenced_file_changed AFTER UPDATE OF file_key ON items WHEN NEW.file_key IS NOT NULL AND NEW.file_key IS NOT OLD.file_key BEGIN
 DELETE FROM blob_deletions WHERE file_key=NEW.file_key AND status='pending';
END;
