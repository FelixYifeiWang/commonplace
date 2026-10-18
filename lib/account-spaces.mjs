// Keep existing file paths, subscriptions and records under their stable owner.
// A verified account gets its own space unless it explicitly proves ownership
// of the old prototype through its signed legacy session cookie.
export function createAccountSpaces(db) {
  const personalOwner = (authId) => `account:${authId}`;
  const linked = (authId) =>
    db
      .prepare("SELECT owner_id FROM account_spaces WHERE auth_id=?")
      .bind(authId)
      .first();
  return {
    async owner(authId) {
      if (!authId) throw new Error("An authenticated account is required.");
      return (await linked(authId))?.owner_id || personalOwner(authId);
    },
    async canClaim(authId, proof = false) {
      if (!authId || !proof || (await linked(authId))) return false;
      const claimed = await db
        .prepare(
          "SELECT auth_id FROM account_spaces WHERE owner_id='hosted-owner'",
        )
        .first();
      if (claimed) return false;
      const existing = await db
        .prepare(
          "SELECT id FROM collections WHERE owner_id=? UNION ALL SELECT id FROM devices WHERE owner_id=? LIMIT 1",
        )
        .bind(personalOwner(authId), personalOwner(authId))
        .first();
      return !existing;
    },
    async claim(authId, proof = false) {
      if (!authId || !proof)
        throw new Error("Existing space ownership is required.");
      // The unique owner constraint and empty-space guard are checked in the
      // same statement, so racing accounts cannot claim or overwrite it.
      await db
        .prepare(
          `INSERT OR IGNORE INTO account_spaces(auth_id,owner_id,created_at)
        SELECT ?, 'hosted-owner', ?
        WHERE NOT EXISTS (SELECT 1 FROM collections WHERE owner_id=?)
          AND NOT EXISTS (SELECT 1 FROM devices WHERE owner_id=?)`,
        )
        .bind(
          authId,
          new Date().toISOString(),
          personalOwner(authId),
          personalOwner(authId),
        )
        .run();
      return (await linked(authId))?.owner_id === "hosted-owner";
    },
  };
}
