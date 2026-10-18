import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createStoryStore } from "../lib/story-store.mjs";
import { prepareStoryBatch, prepareSessionBatch } from "../lib/story.mjs";
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
  return { sqlite, store, add, advance: (ms) => (time += ms) };
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
