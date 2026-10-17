import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createStoryStore } from "../lib/story-store.mjs";
import { prepareStoryBatch } from "../lib/story.mjs";
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
