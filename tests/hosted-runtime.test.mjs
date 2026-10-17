import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createTursoD1 } from "../lib/turso-d1.mjs";
import {
  createSession,
  verifySession,
  SESSION_SECONDS,
  equalSecret,
} from "../lib/hosted-auth.mjs";

test("hosted sessions reject forgery, expiry and missing configuration", () => {
  const secret = "test-secret-".repeat(6),
    now = 1000000000;
  const token = createSession(secret, now);
  assert.equal(verifySession(token, secret, now), "hosted-owner");
  assert.equal(
    verifySession(token, secret, now + SESSION_SECONDS * 1000),
    null,
  );
  assert.equal(verifySession(token + "tampered", secret, now), null);
  assert.equal(verifySession(token, "wrong", now), null);
  assert.equal(verifySession(token, undefined, now), null);
  assert.equal(equalSecret("", undefined), false);
});

test("Turso adapter preserves column ordering and atomic D1 batch behavior", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE notes(id TEXT PRIMARY KEY, body TEXT)");
  const connection = {
    async batch(statements, options) {
      const transaction = typeof options === "string";
      if (transaction) sqlite.exec("BEGIN");
      try {
        const results = statements.map(({ sql, args }) => {
          const stmt = sqlite.prepare(sql),
            columns = stmt.columns();
          if (columns.length) {
            const rows = stmt.all(...args);
            return {
              rows: options?.raw
                ? rows.map((row) => columns.map((c) => row[c.name]))
                : rows,
              rowsAffected: 0,
            };
          }
          const result = stmt.run(...args);
          return { rows: [], rowsAffected: result.changes };
        });
        if (transaction) sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        if (transaction) sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const db = createTursoD1(connection);
  try {
    await assert.rejects(
      db.batch([
        db.prepare("INSERT INTO notes VALUES(?,?)").bind("a", "first"),
        db.prepare("INSERT INTO notes VALUES(?,?)").bind("a", "duplicate"),
      ]),
    );
    assert.equal(
      await db.prepare("SELECT count(*) n FROM notes").first("n"),
      0,
    );
    assert.equal(
      (
        await db
          .prepare("INSERT INTO notes VALUES(?,?)")
          .bind("b", "second")
          .run()
      ).meta.changes,
      1,
    );
    assert.deepEqual(await db.prepare("SELECT body,id FROM notes").raw(), [
      ["second", "b"],
    ]);
    assert.equal(
      (await db.prepare("SELECT body FROM notes").first()).body,
      "second",
    );
  } finally {
    sqlite.close();
  }
});
