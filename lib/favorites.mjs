export const MAX_FAVORITES = 5;
// One conditional SQLite write enforces the cap even for simultaneous requests.
export const favoriteUpdateSQL = `UPDATE collections SET favorite=?
WHERE id=? AND owner_id=? AND deleted_at IS NULL
AND (?=0 OR favorite=1 OR (SELECT COUNT(*) FROM collections WHERE owner_id=? AND deleted_at IS NULL AND favorite=1)<5)
RETURNING id`;
export function overlayFavorites(data, pending) {
  return {
    ...data,
    collections: data.collections.map((c) =>
      pending.has(c.id) ? { ...c, favorite: pending.get(c.id) } : c,
    ),
  };
}
