// Register before granting upload access, so an interrupted item save cannot
// leave an untracked file. Cleanup checks references again before deleting.
export async function queueUpload(db, ownerId, key, now = Date.now()) {
  if (
    !key.startsWith(`users/${encodeURIComponent(ownerId)}/`) ||
    !/^users\/[^/]+\/[0-9a-f-]{36}\/[^/]+$/.test(key) ||
    key.includes("..")
  )
    throw new Error("File unavailable.");
  const row = await db
    .prepare(
      `
    INSERT INTO blob_deletions(file_key,owner_id,not_before) VALUES(?,?,?)
    ON CONFLICT(file_key) DO UPDATE SET not_before=MAX(not_before,excluded.not_before)
    WHERE status='pending' AND owner_id=excluded.owner_id
    RETURNING file_key
  `,
    )
    .bind(key, ownerId, now + 86400000)
    .first();
  if (!row) throw new Error("File unavailable.");
}
