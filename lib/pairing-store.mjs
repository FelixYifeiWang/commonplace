export const PAIRING_TTL = 30 * 60 * 1000;
export function createPairingStore(db) {
  const statement = (sql, args = []) => db.prepare(sql).bind(...args);
  return {
    async status(codeHash, ownerId, now = Date.now()) {
      const row = await statement(
        "SELECT expires_at,ready_at FROM pairing_codes WHERE code_hash=? AND owner_id=?",
        [codeHash, ownerId],
      ).first();
      if (!row) return null;
      return row.ready_at
        ? "ready"
        : row.expires_at <= now
          ? "expired"
          : "pending";
    },
    async ready(codeHash, deviceId, now = Date.now()) {
      const result = await statement(
        "UPDATE pairing_codes SET ready_at=COALESCE(ready_at,?) WHERE code_hash=? AND claim_id=? AND expires_at>?",
        [now, codeHash, deviceId, now],
      ).run();
      return result.meta.changes === 1;
    },
    async issue(codeHash, ownerId, now = Date.now()) {
      await db.batch([
        statement("DELETE FROM pairing_codes WHERE expires_at<?", [now]),
        statement(
          "INSERT INTO pairing_codes(code_hash,owner_id,expires_at) VALUES(?,?,?)",
          [codeHash, ownerId, now + PAIRING_TTL],
        ),
      ]);
      return now + PAIRING_TTL;
    },
    async claim({ codeHash, deviceId, tokenHash, name, now = Date.now() }) {
      // Both steps are one SQLite transaction; only the winning claim can mint a device.
      const results = await db.batch([
        statement(
          "UPDATE pairing_codes SET claim_id=? WHERE code_hash=? AND claim_id IS NULL AND expires_at>?",
          [deviceId, codeHash, now],
        ),
        statement(
          "INSERT OR IGNORE INTO devices(id,owner_id,name,token_hash,created_at) SELECT ?,owner_id,?,?,? FROM pairing_codes WHERE code_hash=? AND claim_id=?",
          [
            deviceId,
            name,
            tokenHash,
            new Date(now).toISOString(),
            codeHash,
            deviceId,
          ],
        ),
      ]);
      return results[0].meta.changes === 1;
    },
  };
}
