-- Keep only source identities so a later sync cannot recreate erased media.
CREATE TABLE item_suppressions(owner_id text NOT NULL,session_id text NOT NULL,identity text NOT NULL,PRIMARY KEY(owner_id,session_id,identity));
--> statement-breakpoint
CREATE TRIGGER suppressed_item_no_insert BEFORE INSERT ON items
WHEN EXISTS(SELECT 1 FROM item_suppressions WHERE owner_id=NEW.owner_id AND session_id=NEW.session_id AND identity=NEW.identity) BEGIN
 SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER session_suppression_cleanup AFTER DELETE ON sessions BEGIN
 DELETE FROM item_suppressions WHERE session_id=OLD.id AND owner_id=OLD.owner_id;
END;
