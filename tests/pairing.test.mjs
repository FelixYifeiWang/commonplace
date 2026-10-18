import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createPairingStore, PAIRING_TTL } from "../lib/pairing-store.mjs";
test("setup codes expire, can be claimed once, and mint only the issuing owner device", async () => {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("drizzle/" + f, "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args),
    run: async () => ({
      meta: { changes: Number(db.prepare(sql).run(...args).changes) },
    }),
  });
  const store = createPairingStore({
    prepare: stmt,
    batch: async (ss) => {
      db.exec("BEGIN");
      try {
        const result = [];
        for (const s of ss) result.push(await s.run());
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  });
  try {
    await store.issue("hash", "alice", 100);
    assert.equal(
      await store.claim({
        codeHash: "hash",
        deviceId: "d1",
        tokenHash: "token",
        name: "Buddy",
        now: 200,
      }),
      true,
    );
    assert.equal(
      await store.claim({
        codeHash: "hash",
        deviceId: "d2",
        tokenHash: "other",
        name: "Buddy",
        now: 201,
      }),
      false,
    );
    assert.equal(
      db.prepare("SELECT owner_id FROM devices").get().owner_id,
      "alice",
    );
    await store.issue("expired", "bob", 100);
    assert.equal(
      await store.claim({
        codeHash: "expired",
        deviceId: "d3",
        tokenHash: "other",
        name: "Buddy",
        now: 100 + PAIRING_TTL,
      }),
      false,
    );
    assert.equal(db.prepare("SELECT count(*) n FROM devices").get().n, 1);
  } finally {
    db.close();
  }
});
