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
    db
      .prepare(
        `INSERT INTO collections(id,owner_id,name,description,created_at)
      SELECT ?,?,?,'',? WHERE NOT EXISTS(
        SELECT 1 FROM sessions WHERE device_id=? AND external_id=? AND provider=? AND state!='revoked')`,
      )
      .bind(collectionId, ownerId, title, now, deviceId, externalId, provider),
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
  return result[1].meta.changes === 1;
}
