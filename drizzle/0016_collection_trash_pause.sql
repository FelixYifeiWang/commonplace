ALTER TABLE sessions ADD COLUMN state_before_trash text;
--> statement-breakpoint
CREATE INDEX collections_deleted_at ON collections(deleted_at);
--> statement-breakpoint
CREATE TRIGGER collection_trashing BEFORE UPDATE OF deleted_at ON collections
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
 UPDATE sessions SET state_before_trash=state,state= CASE WHEN state='revoked' THEN 'revoked' ELSE 'paused' END WHERE collection_id=OLD.id;
 UPDATE stories SET lease_token=NULL,lease_until=0,status='pending' WHERE collection_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER collection_untrashing AFTER UPDATE OF deleted_at ON collections
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL BEGIN
 UPDATE sessions SET state= CASE WHEN state='revoked' THEN 'revoked' ELSE COALESCE(state_before_trash,state) END,state_before_trash=NULL WHERE collection_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER trashed_session_no_resume BEFORE UPDATE ON sessions
WHEN NEW.state NOT IN ('paused','revoked') AND EXISTS(SELECT 1 FROM collections WHERE id=OLD.collection_id AND deleted_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER trashed_item_no_insert BEFORE INSERT ON items
WHEN EXISTS(SELECT 1 FROM collections WHERE id=NEW.collection_id AND deleted_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER trashed_item_no_update BEFORE UPDATE ON items
WHEN EXISTS(SELECT 1 FROM collections WHERE id=OLD.collection_id AND deleted_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER trashed_turn_no_insert BEFORE INSERT ON turns
WHEN EXISTS(SELECT 1 FROM sessions s JOIN collections c ON c.id=s.collection_id WHERE s.id=NEW.session_id AND c.deleted_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
