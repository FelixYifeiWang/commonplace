import { retentionCutoff } from "./item-retention.mjs";

export function createCollectionTrash(db, { now = Date.now } = {}) {
  async function list(ownerId) {
    const result = await db
      .prepare(
        `SELECT id,name,description,favorite,EXISTS(SELECT 1 FROM sessions s WHERE s.collection_id=collections.id AND s.state_before_trash NOT IN ('paused','revoked','complete') AND s.state!='revoked') AS resumeOnRestore,frozen_at AS frozenAt,deleted_at AS deletedAt,created_at AS createdAt
      FROM collections WHERE owner_id=? AND deleted_at>? ORDER BY deleted_at DESC`,
      )
      .bind(ownerId, retentionCutoff(now()))
      .all();
    return result.results;
  }
  async function remove(ownerId, id) {
    const date = new Date(now()).toISOString();
    // The Trash trigger remembers the previous session state, pauses capture and
    // cancels generation atomically. Existing frozen snapshots stay frozen.
    const result = await db
      .prepare(
        `UPDATE collections SET deleted_at=?
      WHERE id=? AND owner_id=? AND deleted_at IS NULL`,
      )
      .bind(date, id, ownerId)
      .run();
    return result.meta.changes === 1;
  }
  async function restore(ownerId, id) {
    const result = await db
      .prepare(
        `UPDATE collections SET deleted_at=NULL,favorite=0
      WHERE id=? AND owner_id=? AND deleted_at>?`,
      )
      .bind(id, ownerId, retentionCutoff(now()))
      .run();
    return result.meta.changes === 1;
  }
  /** @param {string | null} [ownerId] */
  async function purge(ownerId = null) {
    // Recheck the cutoff in each statement inside one transaction. A restore
    // completed before this batch is never removed. Work is bounded per run.
    const expired = `SELECT id FROM collections WHERE deleted_at<=? AND (? IS NULL OR owner_id=?) ORDER BY deleted_at LIMIT 100`;
    const args = [retentionCutoff(now()), ownerId, ownerId];
    const queries = [
      `UPDATE sessions SET state='revoked' WHERE collection_id IN (${expired})`,
      `DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE collection_id IN (${expired}))`,
      `DELETE FROM items WHERE collection_id IN (${expired})`,
      `DELETE FROM collection_reference_links WHERE collection_id IN (${expired})`,
      `DELETE FROM sessions WHERE collection_id IN (${expired})`,
      `DELETE FROM story_beats WHERE collection_id IN (${expired})`,
      `DELETE FROM stories WHERE collection_id IN (${expired})`,
      `DELETE FROM collections WHERE id IN (${expired})`,
    ];
    const results = await db.batch(
      queries.map((sql) => db.prepare(sql).bind(...args)),
    );
    return results.at(-1).meta.changes;
  }
  return { list, remove, restore, purge };
}
