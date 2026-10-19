import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createStoryStore } from "../lib/story-store.mjs";
import { createItemTrash } from "../lib/item-trash.mjs";
import {
  ITEM_RETENTION_MS,
  itemAvailable,
  daysToRestore,
} from "../lib/item-retention.mjs";
import {
  prepareStoryBatch,
  prepareSessionBatch,
  normalizeCuratedSession,
} from "../lib/story.mjs";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("drizzle/" + file, "utf8"));
  const make = (sql, args = []) => ({
    bind: (...args) => make(sql, args),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({
      meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) },
    }),
  });
  const db = {
    prepare: make,
    batch: async (ss) => {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const s of ss) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  let time = Date.now() + 20000;
  const store = createStoryStore(db, { now: () => time });
  sqlite
    .prepare(
      "INSERT INTO collections(id,owner_id,name,created_at) VALUES('c','u','Quiet','2026-10-17')",
    )
    .run();
  const add = (id = "i") =>
    sqlite
      .prepare(
        "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,source_text,source_role,created_at,updated_at) VALUES(?,'u','c',?,'note','Quiet','Keep it quiet','Keep it quiet','user','2026-10-17','2026-10-17')",
      )
      .run(id, id);
  return { sqlite, db, store, add, advance: (ms) => (time += ms) };
}
const beat = {
  title: "A quiet start",
  text: "The idea started quietly.",
  connections: [],
  evidence: [],
};
test("durable triggers coalesce changes and exclusive lease prevents duplicate generation", async () => {
  const { sqlite, store, add } = fixture();
  try {
    add();
    const jobs = await Promise.all([store.claim(), store.claim()]);
    assert.equal(jobs.filter(Boolean).length, 1);
  } finally {
    sqlite.close();
  }
});
test("append commits leave earlier beats byte-for-byte intact and replay is idempotent", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const job = await store.claim();
    const batch = await prepareStoryBatch(job);
    await store.complete(job, batch, [beat], "gpt-6-luna");
    const old = JSON.stringify((await store.get("c", "u")).beats);
    assert.equal(await store.complete(job, batch, [beat], "gpt-6-luna"), false);
    advance(20000);
    add("new");
    const next = await store.claim();
    await store.complete(
      next,
      await prepareStoryBatch(next),
      [{ ...beat, title: "Next" }],
      "gpt-6-luna",
    );
    assert.equal(
      JSON.stringify((await store.get("c", "u")).beats.slice(0, 1)),
      old,
    );
    assert.equal(await store.get("c", "someone-else"), null);
  } finally {
    sqlite.close();
  }
});
test("an update during generation remains queued after the older batch commits", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const job = await store.claim();
    add("later");
    await store.complete(
      job,
      await prepareStoryBatch(job),
      [beat],
      "gpt-6-luna",
    );
    advance(20000);
    assert.ok(await store.claim());
  } finally {
    sqlite.close();
  }
});
test("failed generation keeps its cursor; deleted channels cannot accept an in-flight completion", async () => {
  const { sqlite, store, add } = fixture();
  try {
    add();
    const job = await store.claim();
    await store.fail(job, "Provider unavailable");
    assert.equal((await store.get("c", "u")).status, "error");
    await store.retry("c", "u");
    const retry = await store.claim();
    assert.deepEqual(retry.checkpoint, job.checkpoint);
    sqlite.exec("UPDATE collections SET deleted_at='now' WHERE id='c'");
    assert.equal(
      await store.complete(
        retry,
        await prepareStoryBatch(retry),
        [beat],
        "gpt-6-luna",
      ),
      false,
    );
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM story_beats").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
test("expired leases cannot append after a replacement worker claims the job", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const old = await store.claim();
    advance(200000);
    const current = await store.claim();
    assert.ok(current);
    assert.equal(
      await store.complete(
        old,
        await prepareStoryBatch(old),
        [beat],
        "gpt-6-luna",
      ),
      false,
    );
  } finally {
    sqlite.close();
  }
});

test("story triggers survive Wrangler's SQL migration splitter", async () => {
  const { unstable_splitSqlQuery } = await import("wrangler");
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      for (const statement of unstable_splitSqlQuery(
        readFileSync("drizzle/" + file, "utf8"),
      ))
        sqlite.exec(statement);
    }
    assert.equal(
      sqlite
        .prepare(
          "SELECT count(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'story_%'",
        )
        .get().count,
      6,
    );
  } finally {
    sqlite.close();
  }
});

test("session snapshots continue the current version without deleting legacy beats", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const first = await store.claim();
    const batch = await prepareStoryBatch(first);
    await store.complete(first, batch, [beat], "gpt-6-luna");
    advance(20000);
    add("later");
    const job = await store.claim();
    const session = {
      steps: [],
      map: { center: { label: "Quiet", itemId: null, url: null }, nodes: [] },
    };
    assert.equal(
      await store.completeSession(
        job,
        await prepareStoryBatch(job),
        session,
        "gpt-6-luna",
      ),
      true,
    );
    assert.deepEqual((await store.get("c", "u")).session, session);
    assert.equal((await store.get("c", "u")).beats.length, 1);
    assert.equal(
      await store.completeSession(
        job,
        batch,
        { ...session, steps: [beat] },
        "gpt-6-luna",
      ),
      false,
    );
    advance(20000);
    add("next");
    const next = await store.claim();
    assert.deepEqual(next.current, session);
    await store.fail(next, "Unavailable");
    assert.deepEqual((await store.get("c", "u")).session, session);
  } finally {
    sqlite.close();
  }
});

test("a failed request waits for retry or a new revision instead of spending forever", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const job = await store.claim();
    await store.fail(job, "Invalid response");
    advance(3600000);
    assert.equal(await store.claim(), null);
    await store.retry("c", "u");
    assert.ok(await store.claim());
  } finally {
    sqlite.close();
  }
});

test("session names follow new project names and expired workers cannot rename", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    sqlite
      .prepare(
        "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at) VALUES('s','u','c','Original session','Codex','hash','2026-10-18')",
      )
      .run();
    add();
    const job = await store.claim();
    const batch = { checkpoint: {}, hasMore: false };
    await store.completeSession(
      job,
      batch,
      { collectionName: "Portfolio Website", steps: [], map: {} },
      "test",
    );
    assert.equal(
      sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name,
      "Portfolio Website",
    );
    add("second");
    advance(2000);
    const next = await store.claim();
    await store.completeSession(
      next,
      batch,
      { collectionName: "Field Notes", steps: [], map: {} },
      "test",
    );
    await store.completeSession(
      job,
      batch,
      { collectionName: "Stale name", steps: [], map: {} },
      "test",
    );
    assert.equal(
      sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name,
      "Field Notes",
    );
    assert.equal(
      sqlite.prepare("SELECT title FROM sessions WHERE id='s'").get().title,
      "Original session",
    );
  } finally {
    sqlite.close();
  }
});

test("a name the owner gives a session collection is kept by later Story updates", async () => {
  const { sqlite, store, add, advance } = fixture();
  const name = () =>
    sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name;
  try {
    sqlite
      .prepare(
        "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at) VALUES('s','u','c','Original session','Codex','hash','2026-10-18')",
      )
      .run();
    add();
    const batch = { checkpoint: {}, hasMore: false };
    const first = await store.claim();
    await store.completeSession(
      first,
      batch,
      { collectionName: "Newron", steps: [], map: {} },
      "test",
    );
    assert.equal(name(), "Newron");
    // The owner renames it (PATCH /api/collections, action "rename").
    sqlite
      .prepare("UPDATE collections SET name='Newron (main)' WHERE id='c'")
      .run();
    add("second");
    advance(2000);
    const next = await store.claim();
    assert.equal(
      await store.completeSession(
        next,
        batch,
        { collectionName: "Newron", steps: [], map: {} },
        "test",
      ),
      true,
    );
    assert.equal(name(), "Newron (main)");
  } finally {
    sqlite.close();
  }
});
test("manual collection names are kept when generating a story", async () => {
  const { sqlite, store, add } = fixture();
  try {
    add();
    const job = await store.claim();
    await store.completeSession(
      job,
      { checkpoint: {}, hasMore: false },
      { collectionName: "Model suggestion", steps: [], map: {} },
      "test",
    );
    assert.equal(
      sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name,
      "Quiet",
    );
  } finally {
    sqlite.close();
  }
});

test("later Story updates retain sources used only by every words-canvas form", async () => {
  const { sqlite, store, add } = fixture();
  try {
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at) VALUES('s','u','c','Test','Codex','hash','2026-10-18')",
    );
    const forms = ["line", "flow", "change", "spec", "number"];
    const source = "Use black and white. Keep sources intact.";
    for (const form of [...forms, "later"])
      sqlite
        .prepare(
          "INSERT INTO turns(id,session_id,owner_id,external_id,role,body,created_at) VALUES(?,'s','u',?,'user',?,'2026-10-18')",
        )
        .run(
          form,
          form,
          form === "line"
            ? "Earlier discussion. ".repeat(400) + source
            : source,
        );
    add();
    const current = {
      steps: forms.map((form) => ({
        evidence: [],
        canvas: {
          layout: "words",
          items: [],
          words: {
            form,
            rows: [{ label: "Rule", text: source, sourceId: form }],
          },
        },
      })),
      map: { nodes: [] },
    };
    sqlite
      .prepare(
        "UPDATE stories SET session_json=?,checkpoint=?,next_attempt_at=0,lease_until=0",
      )
      .run(
        JSON.stringify(current),
        JSON.stringify({ turnSequence: 6, turnOffset: 0, items: {} }),
      );
    const job = await store.claim();
    const batch = await prepareSessionBatch(job);
    for (const form of forms) {
      const retained = batch.input.transcript.find((t) => t.id === form);
      assert.ok(
        retained?.text.includes(source),
        `${form} source retained after the checkpoint`,
      );
    }
    assert.deepEqual(batch.input.current, current);
  } finally {
    sqlite.close();
  }
});

test("deletion alone refreshes Story and map, and restore refreshes again", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const first = await store.claim();
    const batch = await prepareSessionBatch(first);
    await store.completeSession(
      first,
      batch,
      { steps: [], map: { center: {}, nodes: [] } },
      "test",
    );
    sqlite
      .prepare("UPDATE items SET deleted_at=? WHERE id='i'")
      .run(new Date().toISOString());
    advance(20000);
    const deletedJob = await store.claim();
    assert.ok(deletedJob, "deletion queues work without a new message");
    const deleted = await prepareSessionBatch(deletedJob);
    assert.equal(deleted.needsModel, true);
    assert.equal(deleted.input.media.length, 0);
    assert.deepEqual(deleted.input.removedMedia, [{ id: "i", url: null }]);
    assert.equal(deleted.checkpoint.items.i, undefined);
    await store.completeSession(
      deletedJob,
      deleted,
      { steps: [], map: { center: {}, nodes: [] } },
      "test",
    );
    sqlite.exec("UPDATE items SET deleted_at=NULL WHERE id='i'");
    advance(20000);
    const restored = await prepareSessionBatch(await store.claim());
    assert.equal(restored.needsModel, true);
    assert.equal(restored.input.media[0].id, "i");
    assert.deepEqual(restored.input.removedMedia, []);
  } finally {
    sqlite.close();
  }
});

test("Recently deleted is owner-scoped and restore expires at 30 days", async () => {
  const { sqlite, db, add } = fixture();
  const now = Date.now();
  const trash = createItemTrash(db, { now: () => now });
  try {
    for (const id of ["recent", "expired", "boundary", "foreign"]) add(id);
    const age = (id, ms) =>
      sqlite
        .prepare("UPDATE items SET deleted_at=? WHERE id=?")
        .run(new Date(now - ms).toISOString(), id);
    age("recent", 86400000);
    age("expired", ITEM_RETENTION_MS + 1);
    age("boundary", ITEM_RETENTION_MS);
    age("foreign", 1);
    sqlite.exec("UPDATE items SET owner_id='other' WHERE id='foreign'");
    assert.deepEqual(
      (await trash.list("u")).map((i) => i.id),
      ["recent"],
    );
    assert.deepEqual(await trash.restore("other", ["recent"]), []);
    assert.deepEqual(
      await trash.restore("u", ["expired", "boundary", "foreign"]),
      [],
    );
    assert.deepEqual(await trash.restore("u", ["recent"]), ["recent"]);
    assert.deepEqual(await trash.list("u"), []);
    assert.ok(
      sqlite.prepare("SELECT deleted_at FROM items WHERE id='expired'").get()
        .deleted_at,
      "expired tombstone stays to prevent session replay",
    );
  } finally {
    sqlite.close();
  }
});

test("deleted media opens during the buffer but not after it expires", () => {
  const now = Date.now();
  assert.equal(
    itemAvailable(
      { deletedAt: new Date(now - ITEM_RETENTION_MS + 1).toISOString() },
      now,
    ),
    true,
  );
  assert.equal(
    itemAvailable(
      { deletedAt: new Date(now - ITEM_RETENTION_MS).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(itemAvailable({ deletedAt: "invalid" }, now), false);
  assert.equal(itemAvailable({ deletedAt: null }, now), true);
  assert.equal(daysToRestore(new Date(now - 86400000).toISOString(), now), 29);
});

test("first failure keeps an owner-scoped source preview without advancing the checkpoint", async () => {
  const { sqlite, store, add } = fixture();
  try {
    add();
    const job = await store.claim();
    await store.fail(job, "Provider unavailable");
    const state = await store.get("c", "u");
    assert.equal(state.preview, true);
    assert.equal(state.session.map.nodes[0].itemId, "i");
    assert.equal(
      sqlite.prepare("SELECT processed_revision FROM stories").get()
        .processed_revision,
      0,
    );
    assert.equal(await store.get("c", "another-owner"), null);
  } finally {
    sqlite.close();
  }
});
test("verified partial output survives failure but never replaces a previous completed version", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    let job = await store.claim();
    const partial = {
      steps: [beat],
      map: { center: { label: "Quiet", itemId: null, url: null }, nodes: [] },
    };
    const error = Object.assign(
      new Error("Couldn’t verify the sources. Try again."),
      { diagnostic: "Source validation: Invalid canvas.", partial },
    );
    await store.fail(job, error);
    assert.deepEqual((await store.get("c", "u")).session, partial);
    assert.equal(
      sqlite.prepare("SELECT error FROM stories").get().error,
      "Source validation: Invalid canvas.",
    );
    assert.equal(
      (await store.get("c", "u")).error,
      "Couldn’t verify the sources. Try again.",
    );
    advance(20000);
    add("next");
    job = await store.claim();
    await store.fail(
      job,
      Object.assign(new Error("failed"), {
        partial: { ...partial, steps: [] },
      }),
    );
    assert.deepEqual((await store.get("c", "u")).session, partial);
  } finally {
    sqlite.close();
  }
});
test("an expired generation cannot publish a partial result", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const job = await store.claim();
    advance(180001);
    await store.fail(
      job,
      Object.assign(new Error("failed"), { partial: { steps: [beat] } }),
    );
    assert.equal(
      sqlite.prepare("SELECT session_json FROM stories").get().session_json,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("a missing generated view gets a source fallback without altering the saved document", async () => {
  const { sqlite, store, add } = fixture();
  try {
    add();
    const job = await store.claim();
    const empty = {
      steps: [],
      map: { center: { label: "Quiet", itemId: null, url: null }, nodes: [] },
    };
    await store.completeSession(
      job,
      await prepareStoryBatch(job),
      empty,
      "gpt-6-luna",
    );
    const state = await store.get("c", "u");
    assert.deepEqual(state.session, empty);
    assert.ok(
      state.previewSession.steps.length &&
        state.previewSession.map.nodes.length,
    );
    assert.deepEqual(
      JSON.parse(
        sqlite.prepare("SELECT session_json FROM stories").get().session_json,
      ),
      empty,
    );
  } finally {
    sqlite.close();
  }
});

test("legacy verified beats remain the Story view while the map gets a source preview", async () => {
  const { sqlite, store, add } = fixture();
  try {
    add();
    const job = await store.claim();
    await store.complete(
      job,
      await prepareStoryBatch(job),
      [beat],
      "gpt-6-luna",
    );
    const state = await store.get("c", "u");
    assert.equal(state.session, null);
    assert.equal(state.beats[0].text, beat.text);
    assert.ok(state.previewSession.map.nodes.length);
  } finally {
    sqlite.close();
  }
});

test("a curated save is never revised by new turns, and restore puts back exactly what it replaced", async () => {
  const { sqlite, store, add, advance } = fixture();
  try {
    add();
    const first = await store.claim();
    const generated = {
      collectionName: "Quiet",
      steps: [],
      map: { center: { label: "Quiet", itemId: null, url: null }, nodes: [] },
    };
    await store.completeSession(
      first,
      await prepareStoryBatch(first),
      generated,
      "gpt-6-luna",
    );
    advance(20000);
    add("running");
    const running = await store.claim();
    assert.ok(running);
    const curated = normalizeCuratedSession(
      JSON.parse(readFileSync("examples/newron-story.json", "utf8")),
    );
    assert.equal(await store.save("c", "u", curated), true);
    // A job that was already running cannot publish over the curated version.
    assert.equal(
      await store.completeSession(
        running,
        await prepareStoryBatch(running),
        generated,
        "gpt-6-luna",
      ),
      false,
    );
    let story = await store.get("c", "u");
    assert.deepEqual(story.session, curated);
    assert.equal(story.pending, false);
    assert.equal(
      sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name,
      "Newron",
    );
    // Synced turns and a reconnect queue the collection, but the curated version stays and never shows as updating.
    advance(20000);
    add("synced");
    sqlite.prepare("UPDATE collections SET deleted_at=NULL WHERE id='c'").run();
    advance(20000);
    assert.equal(await store.claim(), null);
    story = await store.get("c", "u");
    assert.deepEqual(story.session, curated);
    assert.equal(story.pending, false);
    assert.equal(story.status, "ready");
    // Saving again keeps the original version for restore.
    assert.equal(await store.save("c", "u", curated), true);
    assert.equal(await store.save("c", "other", curated), false);
    assert.equal(await store.restore("c", "u"), true);
    story = await store.get("c", "u");
    assert.deepEqual(story.session, generated);
    assert.equal(
      sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name,
      "Quiet",
    );
    // The turns synced while it was curated are caught up now.
    assert.equal(story.pending, true);
    assert.ok(await store.claim());
    assert.equal(await store.restore("c", "u"), false);
  } finally {
    sqlite.close();
  }
});

test("disconnect freezes content and cancels in-flight generation without removing the collection", async () => {
  const { sqlite, store, add } = fixture();
  try {
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at,state) VALUES('s','u','c','Original session','Codex','old-token','2026-10-17','following')",
    );
    add();
    const original = {
      collectionName: "Quiet",
      steps: [{ title: "Original" }],
      map: { nodes: [{ id: "original" }] },
    };
    sqlite
      .prepare("UPDATE stories SET session_json=? WHERE collection_id='c'")
      .run(JSON.stringify(original));
    const job = await store.claim();
    sqlite.exec("UPDATE collections SET frozen_at='2026-10-19' WHERE id='c'");
    const snapshot = await store.get("c", "u");
    assert.equal(snapshot.pending, false);
    assert.equal(snapshot.status, "ready");
    assert.deepEqual(snapshot.session, original);
    assert.equal(
      sqlite.prepare("SELECT deleted_at FROM collections WHERE id='c'").get()
        .deleted_at,
      null,
    );
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "revoked",
    );
    assert.equal(
      await store.completeSession(
        job,
        await prepareSessionBatch(job),
        { ...original, collectionName: "Changed" },
        "test",
      ),
      false,
    );
    assert.equal(
      await store.complete(job, await prepareStoryBatch(job), [beat], "test"),
      false,
    );
    assert.equal(await store.claim(), null);
    assert.deepEqual((await store.get("c", "u")).session, original);
    assert.equal(
      sqlite.prepare("SELECT name FROM collections WHERE id='c'").get().name,
      "Quiet",
    );
  } finally {
    sqlite.close();
  }
});

test("frozen content rejects late capture, preview changes, regeneration and resume", async () => {
  const { sqlite, store, add } = fixture();
  try {
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at,state) VALUES('s','u','c','Original session','Codex','token','2026-10-17','following')",
    );
    add();
    sqlite.exec("UPDATE collections SET frozen_at='2026-10-19' WHERE id='c'");
    add("late");
    sqlite.exec(
      "UPDATE items SET title='Changed',image_url='https://example.org/new.png',deleted_at='2026-10-19' WHERE id='i'",
    );
    sqlite.exec(
      "INSERT INTO turns(id,owner_id,session_id,external_id,role,body,created_at) VALUES('t','u','s','t','user','Late capture','2026-10-19')",
    );
    sqlite.exec("UPDATE sessions SET state='following' WHERE id='s'");
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM items").get().n, 1);
    assert.equal(
      sqlite.prepare("SELECT title FROM items WHERE id='i'").get().title,
      "Quiet",
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM turns").get().n, 0);
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "revoked",
    );
    assert.equal(await store.rewrite("c", "u"), 0);
    assert.equal(
      await store.save("c", "u", { collectionName: "Changed" }),
      false,
    );
    assert.throws(() =>
      sqlite.exec("UPDATE collections SET frozen_at=NULL WHERE id='c'"),
    );
    sqlite.exec("UPDATE collections SET deleted_at='2026-10-19' WHERE id='c'");
    assert.equal(await store.get("c", "u"), null);
    sqlite.exec("UPDATE collections SET deleted_at=NULL WHERE id='c'");
    assert.equal((await store.get("c", "u")).pending, false);
    assert.equal(await store.claim(), null);
  } finally {
    sqlite.close();
  }
});

test("pause remains reversible and a new subscription can collect independently of the frozen original", async () => {
  const { sqlite, store, add } = fixture();
  try {
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at,state,external_id) VALUES('s','u','c','Session','Codex','token','2026-10-17','following','same-session')",
    );
    add();
    sqlite.exec("UPDATE sessions SET state='paused' WHERE id='s'");
    assert.equal(
      sqlite.prepare("SELECT frozen_at FROM collections WHERE id='c'").get()
        .frozen_at,
      null,
    );
    sqlite.exec("UPDATE sessions SET state='following' WHERE id='s'");
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "following",
    );
    sqlite.exec("UPDATE collections SET frozen_at='2026-10-19' WHERE id='c'");
    sqlite.exec(
      "INSERT INTO collections(id,owner_id,name,created_at) VALUES('new','u','Session','2026-10-19')",
    );
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at,state,external_id) VALUES('new-s','u','new','Session','Codex','new-token','2026-10-19','following','same-session')",
    );
    sqlite.exec(
      "INSERT INTO turns(id,owner_id,session_id,external_id,role,body,created_at) VALUES('t','u','new-s','t','user','Independent new collection','2026-10-19')",
    );
    assert.equal((await store.get("c", "u")).pending, false);
    assert.equal((await store.get("new", "u")).pending, true);
    assert.equal(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM collections WHERE deleted_at IS NULL",
        )
        .get().n,
      2,
    );
  } finally {
    sqlite.close();
  }
});

test("a demo session's new collection is curated before the story job can write it, on every reconnect", async () => {
  const { sqlite, store, advance } = fixture();
  const curated = normalizeCuratedSession(
    JSON.parse(readFileSync("examples/newron-story.json", "utf8")),
  );
  // What POST /api/subscribe does for a session listed in lib/demo-sessions.ts.
  const connect = async (id) => {
    sqlite
      .prepare(
        "INSERT INTO collections(id,owner_id,name,created_at) VALUES(?,'u','neuron','2026-10-19')",
      )
      .run(`session-${id}`);
    sqlite
      .prepare(
        "INSERT INTO sessions(id,owner_id,collection_id,title,provider,external_id,state,token_hash,created_at) VALUES(?,'u',?,'neuron','Claude Code','763053fe','reading','hash','2026-10-19')",
      )
      .run(id, `session-${id}`);
    assert.equal(await store.save(`session-${id}`, "u", curated), true);
    // Nox then syncs the whole transcript into the new collection.
    sqlite
      .prepare(
        "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,source_text,source_role,created_at,updated_at) VALUES(?,'u',?,?,'note','Turn','Turn','Turn','user','2026-10-19','2026-10-19')",
      )
      .run(`item-${id}`, `session-${id}`, `item-${id}`);
    advance(20000);
    const claimed = [];
    for (let job = await store.claim(); job; job = await store.claim())
      claimed.push(job.collectionId);
    assert.ok(!claimed.includes(`session-${id}`));
    const story = await store.get(`session-${id}`, "u");
    assert.deepEqual(story.session, curated);
    assert.equal(story.pending, false);
    assert.equal(
      sqlite
        .prepare("SELECT name FROM collections WHERE id=?")
        .get(`session-${id}`).name,
      "Newron",
    );
  };
  try {
    await connect("first");
    // Deleting the collection disconnects the session, so the next Connect starts a new collection.
    sqlite
      .prepare(
        "UPDATE collections SET deleted_at='2026-10-19' WHERE id='session-first'",
      )
      .run();
    sqlite
      .prepare("UPDATE sessions SET state='revoked' WHERE id='first'")
      .run();
    await connect("second");
  } finally {
    sqlite.close();
  }
});

test("collection Trash pauses updates, preserves views and restores the previous connection", async () => {
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  const { sqlite, db, store, add } = fixture();
  try {
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at,state) VALUES('s','u','c','Session','Codex','token','2026-10-17','following')",
    );
    add();
    const document = JSON.stringify({ steps: [], map: { nodes: [] } });
    sqlite
      .prepare("UPDATE stories SET session_json=? WHERE collection_id='c'")
      .run(document);
    const job = await store.claim();
    const trash = createCollectionTrash(db);
    assert.equal(await trash.remove("someone-else", "c"), false);
    assert.equal(await trash.remove("u", "c"), true);
    assert.equal(await store.get("c", "u"), null);
    assert.equal((await trash.list("u")).length, 1);
    assert.equal((await trash.list("someone-else")).length, 0);
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "paused",
    );
    assert.equal(
      sqlite.prepare("SELECT frozen_at FROM collections WHERE id='c'").get()
        .frozen_at,
      null,
    );
    add("late");
    assert.equal(sqlite.prepare("SELECT count(*) n FROM items").get().n, 1);
    sqlite.exec("UPDATE sessions SET state='following' WHERE id='s'");
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "paused",
    );
    assert.equal(
      await store.completeSession(
        job,
        await prepareSessionBatch(job),
        { steps: [], map: {} },
        "test",
      ),
      false,
    );
    assert.equal(await trash.restore("someone-else", "c"), false);
    assert.equal(await trash.restore("u", "c"), true);
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "following",
    );
    assert.equal(
      sqlite
        .prepare("SELECT session_json FROM stories WHERE collection_id='c'")
        .get().session_json,
      document,
    );
    sqlite.exec("UPDATE sessions SET state='paused' WHERE id='s'");
    await trash.remove("u", "c");
    await trash.restore("u", "c");
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "paused",
    );
    sqlite.exec("UPDATE collections SET frozen_at='2026-10-19' WHERE id='c'");
    await trash.remove("u", "c");
    await trash.restore("u", "c");
    assert.equal(
      sqlite.prepare("SELECT state FROM sessions WHERE id='s'").get().state,
      "revoked",
    );
    assert.equal(
      sqlite.prepare("SELECT frozen_at FROM collections WHERE id='c'").get()
        .frozen_at,
      "2026-10-19",
    );
  } finally {
    sqlite.close();
  }
});

test("collection Trash respects the 30-day restore window and manual collections stay editable", async () => {
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  const { sqlite, db } = fixture();
  try {
    let now = Date.now();
    const trash = createCollectionTrash(db, { now: () => now });
    await trash.remove("u", "c");
    await trash.restore("u", "c");
    assert.equal(
      sqlite.prepare("SELECT frozen_at FROM collections WHERE id='c'").get()
        .frozen_at,
      null,
    );
    await trash.remove("u", "c");
    now += ITEM_RETENTION_MS + 1;
    assert.equal((await trash.list("u")).length, 0);
    assert.equal(await trash.restore("u", "c"), false);
  } finally {
    sqlite.close();
  }
});

test("expired collection cleanup removes only expired owned data and invalidates its session", async () => {
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  const { sqlite, db, add } = fixture();
  try {
    let now = Date.now();
    const trash = createCollectionTrash(db, { now: () => now });
    sqlite.exec(
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at,state) VALUES('s','u','c','Session','Codex','token','2026-10-17','following')",
    );
    add();
    sqlite.exec(
      "PRAGMA foreign_keys=ON; INSERT INTO collections(id,owner_id,name,created_at) VALUES('keep','u','Keep','2026-10-19')",
    );
    await trash.remove("u", "c");
    assert.equal(await trash.purge("u"), 0);
    now += ITEM_RETENTION_MS + 1;
    assert.equal(await trash.purge("other"), 0);
    assert.equal(await trash.purge("u"), 1);
    assert.equal(
      sqlite.prepare("SELECT count(*) n FROM sessions WHERE id='s'").get().n,
      0,
    );
    assert.equal(
      sqlite
        .prepare("SELECT count(*) n FROM items WHERE collection_id='c'")
        .get().n,
      0,
    );
    assert.equal(
      sqlite
        .prepare("SELECT count(*) n FROM stories WHERE collection_id='c'")
        .get().n,
      0,
    );
    assert.equal(await trash.restore("u", "c"), false);
    assert.ok(
      sqlite.prepare("SELECT id FROM collections WHERE id='keep'").get(),
    );
  } finally {
    sqlite.close();
  }
});

test("reconnecting a demo session brings its collection back from Trash, curated again", async () => {
  const { createCollectionTrash } = await import("../lib/collection-trash.mjs");
  const { sqlite, db, store, advance } = fixture();
  const curated = normalizeCuratedSession(
    JSON.parse(readFileSync("examples/newron-story.json", "utf8")),
  );
  const state = () =>
    sqlite.prepare("SELECT state FROM sessions WHERE id='main'").get().state;
  try {
    sqlite
      .prepare(
        "INSERT INTO collections(id,owner_id,name,created_at) VALUES('session-main','u','Newron','2026-10-19')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO sessions(id,owner_id,collection_id,title,provider,external_id,state,token_hash,created_at) VALUES('main','u','session-main','neuron','Claude Code','763053fe','following','hash','2026-10-19')",
      )
      .run();
    assert.equal(await store.save("session-main", "u", curated), true);
    const trash = createCollectionTrash(db);
    // Delete moves it to Trash and pauses the session.
    assert.equal(await trash.remove("u", "session-main"), true);
    assert.equal(state(), "paused");
    assert.equal(await store.get("session-main", "u"), null);
    // What POST /api/subscribe now does for a demo session: restore, resume, save the curated document again.
    advance(1000);
    assert.equal(await trash.restore("u", "session-main"), true);
    sqlite
      .prepare(
        "UPDATE sessions SET mode='follow',state='reading' WHERE id='main'",
      )
      .run();
    assert.equal(state(), "reading");
    assert.equal(await store.save("session-main", "u", curated), true);
    const story = await store.get("session-main", "u");
    assert.deepEqual(story.session, curated);
    assert.equal(story.pending, false);
    assert.equal(
      sqlite
        .prepare("SELECT name FROM collections WHERE id='session-main'")
        .get().name,
      "Newron",
    );
  } finally {
    sqlite.close();
  }
});
