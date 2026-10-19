// A durable outbox separates database deletion from storage deletion. The claim
// blocks new references; failed or interrupted storage requests can be retried.
export function createBlobCleanup(db, { remove, now = Date.now }) {
  async function drain(limit = 100) {
    const rows = await db
      .prepare(
        "SELECT * FROM blob_deletions WHERE status IN ('pending','deleting') AND not_before<=? AND lease_until<? ORDER BY not_before LIMIT ?",
      )
      .bind(now(), now(), limit)
      .all();
    let removed = 0;
    for (const row of rows.results) {
      // Only private files under the recorded owner's namespace are eligible.
      if (
        !row.file_key.startsWith(
          `users/${encodeURIComponent(row.owner_id)}/`,
        ) ||
        row.file_key.includes("..")
      ) {
        await db
          .prepare(
            "UPDATE blob_deletions SET status='invalid',last_error='Invalid file namespace' WHERE file_key=? AND status='pending'",
          )
          .bind(row.file_key)
          .run();
        continue;
      }
      const claimed = await db
        .prepare(
          `UPDATE blob_deletions SET status='deleting',lease_until=?,attempts=attempts+1
        WHERE file_key=? AND lease_until<? AND NOT EXISTS(SELECT 1 FROM items WHERE file_key=blob_deletions.file_key) RETURNING file_key`,
        )
        .bind(now() + 300000, row.file_key, now())
        .first();
      if (!claimed) {
        // A shared file is not garbage. Its final reference deletion queues it again.
        await db
          .prepare(
            "DELETE FROM blob_deletions WHERE file_key=? AND status='pending' AND EXISTS(SELECT 1 FROM items WHERE file_key=blob_deletions.file_key)",
          )
          .bind(row.file_key)
          .run();
        continue;
      }
      try {
        await remove(row.file_key);
        await db
          .prepare(
            "DELETE FROM blob_deletions WHERE file_key=? AND status='deleting'",
          )
          .bind(row.file_key)
          .run();
        removed++;
      } catch {
        // Keep deleting state to prevent a new reference to a possibly removed file.
        await db
          .prepare(
            "UPDATE blob_deletions SET lease_until=0,not_before=?,last_error='Storage deletion failed; retry queued' WHERE file_key=?",
          )
          .bind(now() + 3600000, row.file_key)
          .run();
      }
    }
    return removed;
  }
  return { drain };
}
