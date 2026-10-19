import { retentionCutoff } from "./item-retention.mjs";
const camelRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
export function createItemTrash(db, { now = Date.now } = {}) {
  async function list(ownerId) {
    const result = await db
      .prepare(
        `SELECT i.*,c.name AS collection_name FROM items i
      JOIN collections c ON c.id=i.collection_id AND c.owner_id=i.owner_id
      WHERE i.owner_id=? AND i.deleted_at>? AND c.deleted_at IS NULL AND c.frozen_at IS NULL ORDER BY i.deleted_at DESC`,
      )
      .bind(ownerId, retentionCutoff(now()))
      .all();
    return result.results.map(camelRow);
  }
  async function restore(ownerId, ids) {
    const restored = [];
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      const result = await db
        .prepare(
          `UPDATE items SET deleted_at=NULL
        WHERE owner_id=? AND deleted_at>? AND id IN (${chunk.map(() => "?").join(",")})
        AND collection_id IN (SELECT id FROM collections WHERE owner_id=? AND deleted_at IS NULL AND frozen_at IS NULL)
        RETURNING id`,
        )
        .bind(ownerId, retentionCutoff(now()), ...chunk, ownerId)
        .all();
      restored.push(...result.results.map((row) => row.id));
    }
    return restored;
  }
  async function destroy(ownerId, id) {
    const selected = `SELECT i.id FROM items i JOIN collections c ON c.id=i.collection_id
      WHERE i.id=? AND i.owner_id=? AND c.owner_id=i.owner_id AND i.deleted_at IS NOT NULL
      AND c.deleted_at IS NULL AND c.frozen_at IS NULL`;
    return (await erase(selected, [id, ownerId])) === 1;
  }
  async function purge(ownerId = null) {
    // Bound each run and recheck eligibility inside the transaction. Frozen
    // snapshots and collections with their own Trash retention stay intact.
    const selected = `SELECT i.id FROM items i JOIN collections c ON c.id=i.collection_id
      WHERE i.owner_id=c.owner_id AND i.deleted_at<=? AND (? IS NULL OR i.owner_id=?)
      AND c.deleted_at IS NULL AND c.frozen_at IS NULL ORDER BY i.deleted_at,i.id LIMIT 100`;
    return erase(selected, [retentionCutoff(now()), ownerId, ownerId]);
  }
  async function erase(selected, args) {
    const result = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO item_suppressions(owner_id,session_id,identity)
        SELECT owner_id,session_id,identity FROM items WHERE id IN (${selected}) AND session_id IS NOT NULL`,
        )
        .bind(...args),
      db.prepare(`DELETE FROM items WHERE id IN (${selected})`).bind(...args),
    ]);
    return result[1].meta.changes;
  }
  return { list, restore, destroy, purge };
}
