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
    if (result.meta.changes === 1) return true;
    // Repeated clicks must not extend retention or falsely report failure.
    return !!(await db
      .prepare(
        "SELECT id FROM collections WHERE id=? AND owner_id=? AND deleted_at>?",
      )
      .bind(id, ownerId, retentionCutoff(now()))
      .first());
  }
  async function restore(ownerId, id) {
    const result = await db
      .prepare(
        `UPDATE collections SET deleted_at=NULL,favorite=0
      WHERE id=? AND owner_id=? AND deleted_at>?`,
      )
      .bind(id, ownerId, retentionCutoff(now()))
      .run();
    if (result.meta.changes === 1) return true;
    // Another tab or Nox may already have restored this exact collection.
    return !!(await db
      .prepare(
        "SELECT id FROM collections WHERE id=? AND owner_id=? AND deleted_at IS NULL",
      )
      .bind(id, ownerId)
      .first());
  }
  // Explicit Connect restores and resumes together. Ordinary Restore still
  // preserves the session's previous paused/following state.
  async function restoreForConnection(ownerId, id, sessionId, mode) {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE collections SET deleted_at=NULL,favorite=0
        WHERE id=? AND owner_id=? AND deleted_at>? AND frozen_at IS NULL
        AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND collection_id=collections.id AND owner_id=? AND state!='revoked')`,
        )
        .bind(id, ownerId, retentionCutoff(now()), sessionId, ownerId),
      db
        .prepare(
          `UPDATE sessions SET mode=?,state='reading' WHERE id=? AND owner_id=? AND collection_id=? AND state!='revoked'
        AND EXISTS(SELECT 1 FROM collections WHERE id=? AND owner_id=? AND deleted_at IS NULL AND frozen_at IS NULL)`,
        )
        .bind(mode, sessionId, ownerId, id, id, ownerId),
    ]);
    // A concurrent Connect may already have restored it. Reuse that same
    // active collection instead of reporting a spurious restore failure.
    return results[1].meta.changes === 1;
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
  return { list, remove, restore, restoreForConnection, purge };
}
