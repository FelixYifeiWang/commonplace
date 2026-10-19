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

for (const paused of [false, true])
  test(`Drizzle parameterized capture is atomic when paused=${paused}`, async (t) => {
    const { db, sql: sqlite } = fixture(t);
    const { drizzle } = await import("drizzle-orm/d1");
    const { eq } = await import("drizzle-orm");
    const { sqliteTable, text } = await import("drizzle-orm/sqlite-core");
    const checks = sqliteTable("capture_checks", {
      sessionId: text("session_id").primaryKey(),
      ownerId: text("owner_id").notNull(),
    });
    const turns = sqliteTable("turns", {
      id: text("id").primaryKey(),
      sessionId: text("session_id"),
      ownerId: text("owner_id"),
      externalId: text("external_id"),
      role: text("role"),
      body: text("body"),
      createdAt: text("created_at"),
    });
    const client = drizzle(db);
    if (paused) sqlite.exec("UPDATE sessions SET state='paused' WHERE id='s'");
    const run = () =>
      client.batch([
        client.insert(checks).values({ sessionId: "s", ownerId: "u" }),
        client.insert(turns).values({
          id: "x",
          sessionId: "s",
          ownerId: "u",
          externalId: "x",
          role: "assistant",
          body: "Test",
          createdAt: "now",
        }),
        client.delete(checks).where(eq(checks.sessionId, "s")),
      ]);
    if (paused) await assert.rejects(run(), /CAPTURE_UNAVAILABLE/);
    else await run();
    assert.equal(
      sqlite.prepare("SELECT count(*) n FROM turns").get().n,
      paused ? 0 : 1,
    );
    assert.equal(
      sqlite.prepare("SELECT count(*) n FROM capture_checks").get().n,
      0,
    );
  });

for (const mode of ["follow", "once"])
  test(`Connect restores and resumes the same trashed collection (${mode})`, async (t) => {
    const { db, sql } = fixture(t);
    const { createCollectionTrash } =
      await import("../lib/collection-trash.mjs");
    const trash = createCollectionTrash(db);
    const original = JSON.stringify({
      collectionName: "Original project",
      steps: [{ text: "Keep this story" }],
      map: { center: { label: "Keep this map" } },
    });
    sql
      .prepare("UPDATE stories SET session_json=? WHERE collection_id='c'")
      .run(original);
    sql.exec("UPDATE sessions SET state='paused' WHERE id='s'");
    await trash.remove("u", "c");
    assert.equal(await trash.restoreForConnection("u", "c", "s", mode), true);
    assert.equal(
      sql.prepare("SELECT deleted_at FROM collections WHERE id='c'").get()
        .deleted_at,
      null,
    );
    assert.equal(
      sql.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "reading",
    );
    assert.equal(
      sql.prepare("SELECT mode FROM sessions WHERE id='s'").get().mode,
      mode,
    );
    assert.equal(sql.prepare("SELECT count(*) n FROM collections").get().n, 1);
    assert.equal(
      sql
        .prepare("SELECT session_json FROM stories WHERE collection_id='c'")
        .get().session_json,
      original,
    );
  });
for (const scenario of ["expired", "foreign", "frozen"])
  test(`Connect cannot restore a ${scenario} snapshot`, async (t) => {
    const { db, sql } = fixture(t);
    const { createCollectionTrash } =
      await import("../lib/collection-trash.mjs");
    const trash = createCollectionTrash(db);
    if (scenario === "frozen")
      sql.exec("UPDATE collections SET frozen_at='2026-10-19' WHERE id='c'");
    await trash.remove("u", "c");
    if (scenario === "expired")
      sql
        .prepare("UPDATE collections SET deleted_at=? WHERE id='c'")
        .run(new Date(Date.now() - 31 * 86400000).toISOString());
    assert.equal(
      await trash.restoreForConnection(
        scenario === "foreign" ? "other" : "u",
        "c",
        "s",
        "follow",
      ),
      false,
    );
    assert.ok(
      sql.prepare("SELECT deleted_at FROM collections WHERE id='c'").get()
        .deleted_at,
    );
    assert.notEqual(
      sql.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "reading",
    );
  });

for (const action of ["pause", "trash"])
  test(`${action} keeps completed views complete after resume`, async (t) => {
    const { db, sql, store } = fixture(t);
    const { createCollectionTrash } =
      await import("../lib/collection-trash.mjs");
    const { snapshotReadySQL } = await import("../lib/disconnect.mjs");
    sql.exec(
      "UPDATE stories SET status='ready',processed_revision=revision,session_json='{\"steps\":[{}],\"map\":{\"nodes\":[{}]}}' WHERE collection_id='c'",
    );
    if (action === "pause") {
      sql.exec("UPDATE sessions SET state='paused' WHERE id='s'");
      sql.exec("UPDATE sessions SET state='following' WHERE id='s'");
    } else {
      const trash = createCollectionTrash(db);
      await trash.remove("u", "c");
      await trash.restore("u", "c");
    }
    assert.equal((await store.get("c", "u")).status, "ready");
    assert.equal(
      sql.prepare(`SELECT ${snapshotReadySQL("'c'")} AS ready`).get().ready,
      1,
    );
  });

test("simultaneous first-connect intent reuses one active subscription, including Trash", async (t) => {
  const { db, sql } = fixture(t);
  const { ensureSubscription } = await import("../lib/subscription-store.mjs");
  sql.exec(
    "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES('d','u','Nox','hash','now')",
  );
  const input = {
    ownerId: "u",
    deviceId: "d",
    externalId: "external",
    provider: "Codex",
    title: "Test",
    mode: "follow",
    tokenHash: "hash",
    now: "2026-10-19",
  };
  assert.equal(
    await ensureSubscription(db, { ...input, id: "a", collectionId: "ca" }),
    true,
  );
  assert.equal(
    await ensureSubscription(db, { ...input, id: "b", collectionId: "cb" }),
    false,
  );
  sql.exec("UPDATE collections SET deleted_at='2026-10-19' WHERE id='ca'");
  assert.equal(
    await ensureSubscription(db, { ...input, id: "b", collectionId: "cb" }),
    false,
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM sessions WHERE device_id='d'").get().n,
    1,
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM collections WHERE id='cb'").get().n,
    0,
  );
  sql.exec(
    "UPDATE collections SET deleted_at=NULL WHERE id='ca';UPDATE collections SET frozen_at='2026-10-19' WHERE id='ca'",
  );
  assert.equal(
    await ensureSubscription(db, { ...input, id: "b", collectionId: "cb" }),
    true,
  );
  assert.equal(
    sql.prepare("SELECT state FROM sessions WHERE id='a'").get().state,
    "revoked",
  );
});

test("repeated Delete/Restore is idempotent without extending the recovery window", async (t) => {
  const { db, sql } = fixture(t);
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  let time = Date.now();
  const trash = createCollectionTrash(db, { now: () => time });
  await trash.remove("u", "c");
  const original = sql
    .prepare("SELECT deleted_at FROM collections WHERE id='c'")
    .get().deleted_at;
  time += 86400000;
  assert.equal(await trash.remove("u", "c"), true);
  assert.equal(
    sql.prepare("SELECT deleted_at FROM collections WHERE id='c'").get()
      .deleted_at,
    original,
  );
  assert.equal(await trash.restore("u", "c"), true);
  assert.equal(await trash.restore("u", "c"), true);
  assert.equal(await trash.restore("other", "c"), false);
});

for (const scenario of [
  "legacy trash",
  "new device",
  "frozen",
  "current revoked",
  "other owner",
  "other provider",
])
  test(`subscription matching handles ${scenario} safely`, async (t) => {
    const { db, sql } = fixture(t);
    const { ensureSubscription } =
      await import("../lib/subscription-store.mjs");
    sql.exec(
      "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES('d','u','Nox','device','now'),('old','u','Old Nox','old-device','now');UPDATE sessions SET device_id='old',external_id='external' WHERE id='s'",
    );
    if (scenario !== "new device") {
      if (scenario === "frozen")
        sql.exec("UPDATE collections SET frozen_at='now' WHERE id='c'");
      sql
        .prepare("UPDATE collections SET deleted_at=? WHERE id='c'")
        .run(new Date().toISOString());
      sql.exec("UPDATE sessions SET state='revoked' WHERE id='s'");
      if (scenario !== "current revoked")
        sql.exec("UPDATE sessions SET state_before_trash=NULL WHERE id='s'");
    }
    const creates = [
      "frozen",
      "current revoked",
      "other owner",
      "other provider",
    ].includes(scenario);
    assert.equal(
      await ensureSubscription(db, {
        id: "new",
        collectionId: "new-c",
        ownerId: scenario === "other owner" ? "other" : "u",
        deviceId: "d",
        externalId: "external",
        provider: scenario === "other provider" ? "Cursor" : "Codex",
        title: "Test",
        mode: "follow",
        tokenHash: "new-token",
        now: new Date().toISOString(),
      }),
      creates,
    );
    assert.equal(
      sql.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      scenario === "legacy trash"
        ? "paused"
        : scenario === "new device"
          ? "following"
          : "revoked",
    );
  });

test("legacy recovery never replaces an already active collection or revives expired Trash", async (t) => {
  const { db, sql } = fixture(t);
  const { ensureSubscription } = await import("../lib/subscription-store.mjs");
  sql.exec(
    "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES('d','u','Nox','device','now');UPDATE sessions SET external_id='external' WHERE id='s'",
  );
  sql
    .prepare("UPDATE collections SET deleted_at=? WHERE id='c'")
    .run(new Date(Date.now() - 31 * 86400000).toISOString());
  sql.exec(
    "UPDATE sessions SET state='revoked',state_before_trash=NULL WHERE id='s'",
  );
  const input = {
    ownerId: "u",
    deviceId: "d",
    externalId: "external",
    provider: "Codex",
    title: "Test",
    mode: "follow",
    tokenHash: "new-token",
    now: new Date().toISOString(),
  };
  assert.equal(
    await ensureSubscription(db, {
      ...input,
      id: "new",
      collectionId: "new-c",
    }),
    true,
  );
  sql
    .prepare("UPDATE collections SET deleted_at=? WHERE id='c'")
    .run(new Date().toISOString());
  assert.equal(
    await ensureSubscription(db, {
      ...input,
      id: "extra",
      collectionId: "extra-c",
    }),
    false,
  );
  assert.equal(
    sql.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
    "revoked",
  );
});

for (const frozen of [false, true])
  test(`permanent collection deletion removes owned Trash (${frozen ? "frozen" : "connected"})`, async (t) => {
    const { db, sql } = fixture(t);
    const { createCollectionTrash } =
      await import("../lib/collection-trash.mjs");
    const trash = createCollectionTrash(db);
    assert.equal(await trash.destroy("u", "c"), false);
    if (frozen) sql.exec("UPDATE collections SET frozen_at='now' WHERE id='c'");
    await trash.remove("u", "c");
    assert.equal(await trash.destroy("other", "c"), false);
    assert.equal(await trash.destroy("u", "c"), true);
    assert.equal(sql.prepare("SELECT count(*) n FROM sessions").get().n, 0);
    assert.equal(sql.prepare("SELECT count(*) n FROM collections").get().n, 0);
    assert.equal(await trash.restore("u", "c"), false);
  });
test("permanent item deletion removes contents, queues files and suppresses reimport only in its original session", async (t) => {
  const { db, sql } = fixture(t);
  const { createItemTrash } = await import("../lib/item-trash.mjs");
  const trash = createItemTrash(db);
  const insert = (id) =>
    sql
      .prepare(
        "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,source_text,source_role,created_at,updated_at,file_key) VALUES(?,'u','s','c','identity','image','Secret','Secret','user','now','now','users/u/test.png')",
      )
      .run(id);
  insert("i");
  assert.equal(await trash.destroy("u", "i"), false);
  sql.exec("UPDATE items SET deleted_at='now' WHERE id='i'");
  assert.equal(await trash.destroy("other", "i"), false);
  assert.equal(await trash.destroy("u", "i"), true);
  insert("replacement");
  assert.equal(sql.prepare("SELECT count(*) n FROM items").get().n, 0);
  assert.equal(sql.prepare("SELECT count(*) n FROM blob_deletions").get().n, 1);
  assert.deepEqual(await trash.restore("u", ["i"]), []);
});
test("a Restore that wins before permanent deletion cannot be erased", async (t) => {
  const { db, sql } = fixture(t);
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  const trash = createCollectionTrash(db);
  await trash.remove("u", "c");
  await trash.restore("u", "c");
  assert.equal(await trash.destroy("u", "c"), false);
  assert.equal(sql.prepare("SELECT count(*) n FROM sessions").get().n, 1);
});

test("expired item cleanup removes only expired live-collection Trash and queues files", async (t) => {
  const { db, sql } = fixture(t);
  const { createItemTrash } = await import("../lib/item-trash.mjs");
  const trash = createItemTrash(db, {
    now: () => Date.parse("2026-11-20T00:00:00.000Z"),
  });
  const insert = (id, deletedAt) =>
    sql
      .prepare(
        "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,source_text,source_role,created_at,updated_at,file_key,deleted_at) VALUES(?,'u','s','c',?,'image','Picture','Private','user','now','now',?,?)",
      )
      .run(id, id, `users/u/${id}.png`, deletedAt);
  insert("expired", "2026-10-21T00:00:00.000Z");
  insert("recent", "2026-11-19T00:00:00.000Z");
  insert("live", null);
  assert.equal(await trash.purge("other"), 0);
  assert.equal(await trash.purge("u"), 1);
  assert.deepEqual(
    sql
      .prepare("SELECT id FROM items ORDER BY id")
      .all()
      .map((i) => i.id),
    ["live", "recent"],
  );
  assert.equal(sql.prepare("SELECT count(*) n FROM blob_deletions").get().n, 1);
  insert("expired", null);
  assert.equal(
    sql.prepare("SELECT count(*) n FROM items WHERE id='expired'").get().n,
    0,
  );
  assert.equal(await trash.purge(), 0);
});
for (const state of ["frozen", "trashed"]) {
  test(`item expiry preserves a ${state} collection snapshot`, async (t) => {
    const { db, sql } = fixture(t);
    const { createItemTrash } = await import("../lib/item-trash.mjs");
    sql.exec(
      "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,source_text,source_role,created_at,updated_at,deleted_at) VALUES('i','u','s','c','i','note','Keep','','user','now','now','2026-10-01')",
    );
    sql.exec(
      state === "frozen"
        ? "UPDATE collections SET frozen_at='2026-10-19'"
        : "UPDATE collections SET deleted_at='2026-11-19'",
    );
    const trash = createItemTrash(db, {
      now: () => Date.parse("2026-11-20T00:00:00.000Z"),
    });
    assert.equal(await trash.purge(), 0);
    assert.equal(sql.prepare("SELECT count(*) n FROM items").get().n, 1);
  });
}

test("expiry cleanup is bounded and retries remaining items without losing suppression", async (t) => {
  const { db, sql } = fixture(t);
  const { createItemTrash } = await import("../lib/item-trash.mjs");
  const trash = createItemTrash(db, {
    now: () => Date.parse("2026-11-20T00:00:00.000Z"),
  });
  const insert = sql.prepare(
    "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,source_text,source_role,created_at,updated_at,deleted_at) VALUES(?,'u','s','c',?,'note','Note','','user','now','now','2026-10-01')",
  );
  for (let n = 0; n < 102; n++) insert.run(`i-${n}`, `i-${n}`);
  assert.equal(await trash.purge(), 100);
  assert.equal(await trash.purge(), 2);
  assert.equal(
    sql.prepare("SELECT count(*) n FROM item_suppressions").get().n,
    102,
  );
});
test("restoring an item before its deadline protects it from later expiry cleanup", async (t) => {
  const { db, sql } = fixture(t);
  const { createItemTrash } = await import("../lib/item-trash.mjs");
  let now = Date.parse("2026-10-30T00:00:00.000Z");
  sql.exec(
    "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,source_text,source_role,created_at,updated_at,deleted_at) VALUES('i','u','s','c','i','note','Note','','user','now','now','2026-10-01T00:00:00.000Z')",
  );
  const trash = createItemTrash(db, { now: () => now });
  assert.deepEqual(await trash.restore("u", ["i"]), ["i"]);
  now = Date.parse("2026-11-20T00:00:00.000Z");
  assert.equal(await trash.purge(), 0);
  assert.equal(sql.prepare("SELECT count(*) n FROM items").get().n, 1);
  assert.equal(
    sql.prepare("SELECT count(*) n FROM item_suppressions").get().n,
    0,
  );
});

test("abandoned presigned uploads expire after a grace period, saved files survive", async (t) => {
  const { sql, db } = fixture(t);
  const { queueUpload } = await import("../lib/upload-lease.mjs");
  const { createBlobCleanup } = await import("../lib/blob-cleanup.mjs");
  const key = "users/u/11111111-1111-4111-8111-111111111111/picture.png";
  const saved = key.replace("picture", "saved");
  let time = 1000;
  await queueUpload(db, "u", key, time);
  await queueUpload(db, "u", saved, time);
  sql
    .prepare(
      "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,source_text,source_role,created_at,updated_at,file_key) VALUES('saved','u','c','saved','image','Picture','','','user','now','now',?)",
    )
    .run(saved);
  const removed = [];
  const worker = createBlobCleanup(db, {
    now: () => time,
    remove: async (key) => removed.push(key),
  });
  assert.equal(await worker.drain(), 0);
  time += 86400001;
  assert.equal(await worker.drain(), 1);
  assert.deepEqual(removed, [key]);
});
test("upload leases reject foreign paths and files already being deleted", async (t) => {
  const { sql, db } = fixture(t);
  const { queueUpload } = await import("../lib/upload-lease.mjs");
  const key = "users/u/11111111-1111-4111-8111-111111111111/picture.png";
  await assert.rejects(queueUpload(db, "other", key), /unavailable/);
  await queueUpload(db, "u", key, 1000);
  await queueUpload(db, "u", key, 2000);
  assert.equal(
    sql.prepare("SELECT not_before FROM blob_deletions").get().not_before,
    86402000,
  );
  sql.exec("UPDATE blob_deletions SET status='deleting'");
  await assert.rejects(queueUpload(db, "u", key), /unavailable/);
});

test("double-dot filenames can upload and expire without allowing traversal", async (t) => {
  const { db } = fixture(t);
  const { queueUpload } = await import("../lib/upload-lease.mjs");
  const { createBlobCleanup } = await import("../lib/blob-cleanup.mjs");
  const prefix = "users/u/11111111-1111-4111-8111-111111111111/";
  await queueUpload(db, "u", prefix + "mockup..png", 1000);
  for (const name of [
    "..",
    ".",
    "../file.png",
    "%2e%2e",
    "%2e%2e%2ffile.png",
    "a%5cb.png",
  ])
    await assert.rejects(queueUpload(db, "u", prefix + name), /unavailable/);
  const removed = [];
  await createBlobCleanup(db, {
    now: () => 86401001,
    remove: async (key) => removed.push(key),
  }).drain();
  assert.deepEqual(removed, [prefix + "mockup..png"]);
});
