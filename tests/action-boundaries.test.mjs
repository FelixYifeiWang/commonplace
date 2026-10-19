import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { captureTransaction } from "../lib/capture-transaction.mjs";
import { createStoryStore } from "../lib/story-store.mjs";
function fixture(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync("drizzle/" + f, "utf8"));
  const prepare = (q, args = []) => ({
    bind: (...a) => prepare(q, a),
    first: async () => sql.prepare(q).get(...args) || null,
    all: async () => ({ results: sql.prepare(q).all(...args) }),
    run: async () => ({
      meta: { changes: Number(sql.prepare(q).run(...args).changes) },
    }),
  });
  const db = {
    prepare,
    batch: async (ss) => {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const s of ss) result.push(await s.run());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  sql.exec(
    "INSERT INTO collections(id,owner_id,name,created_at) VALUES('c','u','Test','2026-10-19');INSERT INTO sessions(id,owner_id,collection_id,title,provider,state,token_hash,created_at) VALUES('s','u','c','Test','Codex','following','token','2026-10-19')",
  );
  const turn = (id) =>
    db
      .prepare(
        "INSERT INTO turns(id,session_id,owner_id,external_id,role,body,created_at) VALUES(?,'s','u',?,'assistant','Test','2026-10-19') ON CONFLICT DO NOTHING",
      )
      .bind(id, id);
  return {
    sql,
    db,
    turn,
    session: { id: "s", ownerId: "u" },
    store: createStoryStore(db, { now: () => Date.now() + 120000 }),
  };
}
for (const [name, action] of [
  ["pause", "UPDATE sessions SET state='paused' WHERE id='s'"],
  ["trash", "UPDATE collections SET deleted_at='2026-10-19' WHERE id='c'"],
  ["disconnect", "UPDATE collections SET frozen_at='2026-10-19' WHERE id='c'"],
]) {
  test(`capture authorized before ${name} rejects at commit and remains retryable`, async (t) => {
    const { sql, db, turn, session } = fixture(t);
    sql.exec(action);
    await assert.rejects(
      captureTransaction(db, session, [turn("late")]),
      /CAPTURE_UNAVAILABLE/,
    );
    assert.equal(sql.prepare("SELECT count(*) n FROM turns").get().n, 0);
    if (name === "disconnect") return;
    sql.exec(
      name === "trash"
        ? "UPDATE collections SET deleted_at=NULL WHERE id='c'"
        : "UPDATE sessions SET state='following' WHERE id='s'",
    );
    await captureTransaction(db, session, [turn("late")]);
    await captureTransaction(db, session, [turn("late")]);
    assert.equal(sql.prepare("SELECT count(*) n FROM turns").get().n, 1);
    assert.equal(
      sql.prepare("SELECT count(*) n FROM capture_checks").get().n,
      0,
    );
  });
}
test("capture cannot use another owner or a missing subscription", async (t) => {
  const { db, turn, session } = fixture(t);
  await assert.rejects(
    captureTransaction(db, { ...session, ownerId: "other" }, [turn("a")]),
    /CAPTURE_UNAVAILABLE/,
  );
  await assert.rejects(
    captureTransaction(db, { ...session, id: "missing" }, [turn("b")]),
    /CAPTURE_UNAVAILABLE/,
  );
});
test("Pause cancels the generation lease and blocks new claims until resume", async (t) => {
  const { sql, store } = fixture(t);
  const job = await store.claim();
  assert.ok(job);
  sql.exec("UPDATE sessions SET state='paused' WHERE id='s'");
  assert.equal(
    await store.completeSession(
      job,
      { checkpoint: {}, hasMore: false },
      { steps: [], map: { nodes: [] } },
      "test",
    ),
    false,
  );
  assert.equal(await store.claim(), null);
  sql.exec("UPDATE sessions SET state='following' WHERE id='s'");
  assert.ok(await store.claim());
});

test("physical cleanup retries failures and cannot delete a still-referenced file", async (t) => {
  const { sql, db } = fixture(t);
  const { createBlobCleanup } = await import("../lib/blob-cleanup.mjs");
  let time = Date.now() + 100000;
  const key = "users/u/test/image.png";
  sql
    .prepare(
      "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,source_text,source_role,created_at,updated_at,file_key) VALUES('i','u','c','i','image','Picture','','','user','now','now',?)",
    )
    .run(key);
  sql
    .prepare(
      "INSERT INTO blob_deletions(file_key,owner_id,not_before) VALUES(?,?,0)",
    )
    .run(key, "u");
  let calls = 0;
  const worker = createBlobCleanup(db, {
    now: () => time,
    remove: async () => {
      if (++calls === 1) throw new Error("Temporary storage failure");
    },
  });
  assert.equal(await worker.drain(), 0);
  assert.equal(calls, 0);
  sql.exec("DELETE FROM items WHERE id='i'");
  assert.equal(await worker.drain(), 0);
  assert.equal(
    sql.prepare("SELECT attempts FROM blob_deletions").get().attempts,
    1,
  );
  assert.throws(
    () =>
      sql
        .prepare(
          "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,source_text,source_role,created_at,updated_at,file_key) VALUES('j','u','c','j','image','Picture','','','user','now','now',?)",
        )
        .run(key),
    /permanently removed/,
  );
  time += 3600001;
  assert.equal(await worker.drain(), 1);
  assert.equal(calls, 2);
  assert.equal(sql.prepare("SELECT count(*) n FROM blob_deletions").get().n, 0);
});
test("retention purges database references and queues the file in the same transaction", async (t) => {
  const { sql, db } = fixture(t);
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  sql.exec(
    "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,source_text,source_role,created_at,updated_at,file_key) VALUES('i','u','c','i','image','Picture','','','user','now','now','users/u/test/picture.png')",
  );
  const trash = createCollectionTrash(db, {
    now: () => Date.parse("2026-11-20"),
  });
  sql.exec("UPDATE collections SET deleted_at='2026-10-19' WHERE id='c'");
  assert.equal(await trash.purge("u"), 1);
  assert.equal(
    sql.prepare("SELECT file_key FROM blob_deletions").get().file_key,
    "users/u/test/picture.png",
  );
});

test("disconnect requires explicit consent for an unfinished snapshot, atomically", async (t) => {
  const { sql, db } = fixture(t);
  const { disconnectCollection } = await import("../lib/disconnect.mjs");
  assert.equal(await disconnectCollection(db, "u", "c"), "unfinished");
  assert.equal(
    sql.prepare("SELECT frozen_at FROM collections").get().frozen_at,
    null,
  );
  assert.equal(
    await disconnectCollection(db, "u", "c", { allowIncomplete: true }),
    "disconnected",
  );
  assert.ok(sql.prepare("SELECT frozen_at FROM collections").get().frozen_at);
});
test("ready snapshot disconnects without extra consent, but Trash never freezes", async (t) => {
  const { sql, db } = fixture(t);
  const { disconnectCollection } = await import("../lib/disconnect.mjs");
  sql.exec(
    `UPDATE stories SET session_json='{"steps":[],"map":{"nodes":[]}}',status='ready',processed_revision=revision`,
  );
  sql.exec("UPDATE collections SET deleted_at='2026-10-19' WHERE id='c'");
  assert.equal(
    await disconnectCollection(db, "u", "c", { allowIncomplete: true }),
    "trashed",
  );
  sql.exec(
    "UPDATE collections SET deleted_at=NULL WHERE id='c';UPDATE stories SET status='ready',processed_revision=revision",
  );
  assert.equal(await disconnectCollection(db, "u", "c"), "disconnected");
});

test("paused views expose a stable state and quiet fallback exposes its due time", async (t) => {
  const { sql, store } = fixture(t);
  sql.exec("UPDATE sessions SET state='paused' WHERE id='s'");
  const view = await store.get("c", "u");
  assert.equal(view.pending, false);
  assert.equal(view.status, "paused");
  assert.equal(await store.nextDelay(), null);
  sql.exec("UPDATE sessions SET state='following' WHERE id='s'");
  sql.prepare("UPDATE stories SET publish_after=?").run(Date.now() + 150000);
  assert.equal(await store.claim(), null);
  const delay = await store.nextDelay();
  assert.ok(delay > 29000 && delay <= 30000);
});

test("Drizzle capture batch rolls back a rejected write and never acknowledges it", async (t) => {
  const { db, sql: sqlite } = fixture(t);
  const { drizzle } = await import("drizzle-orm/d1");
  const { sql } = await import("drizzle-orm");
  const client = drizzle(db);
  sqlite.exec("UPDATE sessions SET state='paused' WHERE id='s'");
  await assert.rejects(
    client.batch([
      client.run(
        sql`INSERT INTO capture_checks(session_id,owner_id) VALUES('s','u')`,
      ),
      client.run(
        sql`INSERT INTO turns(id,session_id,owner_id,external_id,role,body,created_at) VALUES('x','s','u','x','assistant','Test','now')`,
      ),
      client.run(sql`DELETE FROM capture_checks WHERE session_id='s'`),
    ]),
    /CAPTURE_UNAVAILABLE/,
  );
  assert.equal(sqlite.prepare("SELECT count(*) n FROM turns").get().n, 0);
});
