import { retentionCutoff } from "./item-retention.mjs";

// A read followed by an unconditional insert races when Connect is repeated.
// Check for an existing live subscription inside the same transaction that
// creates its collection. SQLite serializes competing writers.
export async function ensureSubscription(db, input) {
  const {
    id,
    collectionId,
    ownerId,
    deviceId,
    externalId,
    provider,
    title,
    mode,
    tokenHash,
    now,
  } = input;
  const result = await db.batch([
    // Before Trash paused sessions, Delete revoked them without recording a
    // previous state. Recover only on explicit Connect, within retention, and
    // only if no live subscription already exists. Frozen snapshots stay final.
    db
      .prepare(
        `UPDATE sessions SET state='paused',state_before_trash='paused',token_hash=?
      WHERE id=(SELECT s.id FROM sessions s JOIN collections c ON c.id=s.collection_id
        WHERE s.owner_id=? AND c.owner_id=s.owner_id AND s.external_id=? AND s.provider=?
          AND s.state='revoked' AND s.state_before_trash IS NULL
          AND c.deleted_at>? AND c.frozen_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM sessions live WHERE live.owner_id=s.owner_id
            AND live.external_id=s.external_id AND live.provider=s.provider AND live.state!='revoked')
        ORDER BY c.deleted_at DESC,s.id LIMIT 1)`,
      )
      .bind(
        tokenHash,
        ownerId,
        externalId,
        provider,
        retentionCutoff(Date.parse(now)),
      ),
    db
      .prepare(
        `INSERT INTO collections(id,owner_id,name,description,created_at)
      SELECT ?,?,?,'',? WHERE NOT EXISTS(
        SELECT 1 FROM sessions WHERE owner_id=? AND external_id=? AND provider=? AND state!='revoked')`,
      )
      .bind(collectionId, ownerId, title, now, ownerId, externalId, provider),
    db
      .prepare(
        `INSERT INTO sessions(id,owner_id,device_id,collection_id,title,provider,external_id,mode,state,token_hash,created_at)
      SELECT ?,?,?,?,?,?,?,?,'reading',?,? WHERE EXISTS(SELECT 1 FROM collections WHERE id=? AND owner_id=?)`,
      )
      .bind(
        id,
        ownerId,
        deviceId,
        collectionId,
        title,
        provider,
        externalId,
        mode,
        tokenHash,
        now,
        collectionId,
        ownerId,
      ),
    db
      .prepare("UPDATE devices SET last_seen=? WHERE id=? AND owner_id=?")
      .bind(now, deviceId, ownerId),
  ]);
  return result[2].meta.changes === 1;
}
