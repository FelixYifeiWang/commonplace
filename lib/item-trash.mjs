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
      WHERE i.owner_id=? AND i.deleted_at>? AND c.deleted_at IS NULL ORDER BY i.deleted_at DESC`,
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
        AND collection_id IN (SELECT id FROM collections WHERE owner_id=? AND deleted_at IS NULL)
        RETURNING id`,
        )
        .bind(ownerId, retentionCutoff(now()), ...chunk, ownerId)
        .all();
      restored.push(...result.results.map((row) => row.id));
    }
    return restored;
  }
  return { list, restore };
}
