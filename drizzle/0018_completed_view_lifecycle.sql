-- Pausing cancels outstanding work without making a finished snapshot unfinished.
DROP TRIGGER session_pausing;
--> statement-breakpoint
CREATE TRIGGER session_pausing AFTER UPDATE OF state ON sessions
WHEN NEW.state='paused' AND OLD.state!='paused' BEGIN
 UPDATE stories SET lease_token=NULL,lease_until=0,
 status= CASE WHEN revision<=processed_revision THEN 'ready' ELSE 'pending' END
 WHERE collection_id=NEW.collection_id;
END;
--> statement-breakpoint
DROP TRIGGER collection_trashing;
--> statement-breakpoint
CREATE TRIGGER collection_trashing BEFORE UPDATE OF deleted_at ON collections
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
 UPDATE sessions SET state_before_trash=state,state= CASE WHEN state='revoked' THEN 'revoked' ELSE 'paused' END WHERE collection_id=OLD.id;
 UPDATE stories SET lease_token=NULL,lease_until=0,
 status= CASE WHEN revision<=processed_revision THEN 'ready' ELSE 'pending' END
 WHERE collection_id=OLD.id;
END;
--> statement-breakpoint
-- Repair readiness only, preserving every saved document and frozen snapshot.
UPDATE stories SET status='ready' WHERE status='pending' AND revision<=processed_revision AND session_json IS NOT NULL AND lease_token IS NULL
 AND collection_id IN (SELECT id FROM collections WHERE frozen_at IS NULL);

--> statement-breakpoint
DROP TRIGGER story_collection_restored;
--> statement-breakpoint
-- Restoring the collection changes visibility, not its source content. Pending
-- work can resume; finished views wait for genuinely new source revisions.
CREATE TRIGGER story_collection_restored AFTER UPDATE OF deleted_at ON collections
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL BEGIN
 UPDATE stories SET next_attempt_at=0,error=NULL,status= CASE WHEN revision<=processed_revision THEN 'ready' ELSE 'pending' END WHERE collection_id=NEW.id;
END;
