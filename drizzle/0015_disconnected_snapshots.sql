ALTER TABLE collections ADD COLUMN frozen_at text;
--> statement-breakpoint
-- Freeze and revoke in the same transaction. Clear the generation lease before
-- the marker is set, so a worker already running cannot publish over the snapshot.
CREATE TRIGGER collection_freezing BEFORE UPDATE OF frozen_at ON collections
WHEN OLD.frozen_at IS NULL AND NEW.frozen_at IS NOT NULL BEGIN
 UPDATE stories SET status='ready',processed_revision=revision,error=NULL,lease_token=NULL,lease_until=0,next_attempt_at=0 WHERE collection_id=OLD.id;
 UPDATE sessions SET state='revoked',token_hash=lower(hex(randomblob(32))) WHERE collection_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER collection_stays_frozen BEFORE UPDATE OF frozen_at ON collections
WHEN OLD.frozen_at IS NOT NULL AND NEW.frozen_at IS NOT OLD.frozen_at BEGIN
 SELECT RAISE(ABORT,'Disconnected collections cannot be resumed.');
END;
--> statement-breakpoint
CREATE TRIGGER frozen_session_no_resume BEFORE UPDATE ON sessions
WHEN NEW.state!='revoked' AND EXISTS(SELECT 1 FROM collections WHERE id=OLD.collection_id AND frozen_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER frozen_item_no_insert BEFORE INSERT ON items
WHEN EXISTS(SELECT 1 FROM collections WHERE id=NEW.collection_id AND frozen_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER frozen_item_no_update BEFORE UPDATE ON items
WHEN EXISTS(SELECT 1 FROM collections WHERE id=OLD.collection_id AND frozen_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER frozen_item_no_delete BEFORE DELETE ON items
WHEN EXISTS(SELECT 1 FROM collections WHERE id=OLD.collection_id AND frozen_at IS NOT NULL AND deleted_at IS NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER frozen_turn_no_insert BEFORE INSERT ON turns
WHEN EXISTS(SELECT 1 FROM sessions s JOIN collections c ON c.id=s.collection_id WHERE s.id=NEW.session_id AND c.frozen_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER frozen_story_no_update BEFORE UPDATE ON stories
WHEN EXISTS(SELECT 1 FROM collections WHERE id=OLD.collection_id AND frozen_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER frozen_beat_no_insert BEFORE INSERT ON story_beats
WHEN EXISTS(SELECT 1 FROM collections WHERE id=NEW.collection_id AND frozen_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;
