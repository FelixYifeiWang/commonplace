// A curated snapshot is already final even when its source revision advances.
export const snapshotReadySQL = (
  id,
) => `EXISTS(SELECT 1 FROM stories snapshot WHERE snapshot.collection_id=${id}
 AND snapshot.session_json IS NOT NULL AND (COALESCE(CASE WHEN json_valid(snapshot.session_json) THEN json_extract(snapshot.session_json,'$.curated') END,0)=1
 OR (snapshot.status='ready' AND snapshot.revision=snapshot.processed_revision)))`;
export async function disconnectCollection(
  db,
  ownerId,
  id,
  { allowIncomplete = false, now = Date.now } = {},
) {
  const changed = await db
    .prepare(
      `UPDATE collections SET frozen_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL AND frozen_at IS NULL AND (? OR ${snapshotReadySQL("collections.id")}) RETURNING id`,
    )
    .bind(new Date(now()).toISOString(), id, ownerId, allowIncomplete ? 1 : 0)
    .first();
  if (changed) return "disconnected";
  const collection = await db
    .prepare(
      "SELECT frozen_at,deleted_at FROM collections WHERE id=? AND owner_id=?",
    )
    .bind(id, ownerId)
    .first();
  if (!collection) return "missing";
  if (collection.deleted_at) return "trashed";
  if (collection.frozen_at) return "disconnected";
  return "unfinished";
}
