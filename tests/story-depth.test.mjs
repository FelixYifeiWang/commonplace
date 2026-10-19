import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createStoryStore } from "../lib/story-store.mjs";
import { prepareSessionBatch, sessionInstructions } from "../lib/story.mjs";

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
    batch: async (ss) => Promise.all(ss.map((s) => s.run())),
  };
  const time = Date.now() + 20000;
  sqlite.exec(
    "INSERT INTO collections(id,owner_id,name,created_at) VALUES('c','u','Newron','2026-10-18');" +
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at) VALUES('s','u','c','Newron','Claude Code','hash','2026-10-18');",
  );
  const turn = (id, role, body) =>
    sqlite
      .prepare(
        "INSERT INTO turns(id,session_id,owner_id,external_id,role,body,created_at) VALUES(?,'s','u',?,?,?,'2026-10-18')",
      )
      .run(id, id, role, body);
  const item = (id, kind, extra = {}) =>
    sqlite
      .prepare(
        "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,url,image_url,file_key,source_text,source_role,created_at,updated_at) VALUES(?,'u','s','c',?,?,?,?,?,?,?,?,'2026-10-18','2026-10-18')",
      )
      .run(
        id,
        id,
        kind,
        id,
        extra.url ?? null,
        extra.imageUrl ?? null,
        extra.fileKey ?? null,
        extra.sourceText ?? "",
        extra.role ?? "user",
      );
  return {
    sqlite,
    store: createStoryStore(db, { now: () => time }),
    turn,
    item,
  };
}

test("a claimed job knows which items carry a saved picture", async () => {
  const { store, turn, item } = fixture();
  turn("t1", "user", "make this a reference for the canvas");
  item("pasted", "image", {
    fileKey: "users/u/1/pasted.png",
    sourceText: "make this a reference for the canvas",
  });
  item("capture", "link", {
    url: "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4",
    fileKey: "users/u/2/capture.jpg",
    role: "assistant",
  });
  item("site", "link", {
    url: "https://www.hirotos.com/",
    imageUrl: "https://www.hirotos.com/og.png",
    role: "user",
  });
  const job = await store.claim();
  const visual = Object.fromEntries(
    (await prepareSessionBatch(job)).input.media.map((m) => [m.id, m.visual]),
  );
  assert.deepEqual(visual, {
    pasted: "stored",
    capture: "stored",
    site: "remote",
  });
});

test("each round sees the human's earlier messages, so the steps can span the whole session", async () => {
  const { sqlite, store, turn } = fixture();
  turn("t1", "user", "I'm redesigning the story portion, read this sketch");
  turn("t2", "assistant", "Here is the first mockup.");
  turn("t3", "user", "the canvas should be slightly grey");
  turn("t4", "user", "make the gallery distinct from the story");
  sqlite.exec(
    `UPDATE stories SET checkpoint='{"turnSequence":4,"turnOffset":0,"items":{}}'`,
  );
  const job = await store.claim();
  assert.deepEqual(
    job.arc.map((t) => t.id),
    ["t1", "t3"],
  );
  const transcript = (await prepareSessionBatch(job)).input.transcript;
  assert.deepEqual(
    transcript.map((t) => [t.id, !!t.historical]),
    [
      ["t1", true],
      ["t3", true],
      ["t4", false],
    ],
  );
});

test("a long session's earlier messages share a fixed budget instead of crowding out the new turns", async () => {
  const arc = Array.from({ length: 400 }, (_, i) => ({
    sequence: i + 1,
    id: `a${i}`,
    role: "user",
    body: `decision ${i} `.repeat(200),
  }));
  const batch = await prepareSessionBatch({
    title: "Long",
    checkpoint: { turnSequence: 401, turnOffset: 0, items: {} },
    turns: [
      { sequence: 401, id: "now", role: "user", body: "the latest turn" },
    ],
    items: [],
    previous: [],
    current: null,
    history: [],
    arc,
  });
  const earlier = batch.input.transcript.filter((t) => t.historical);
  assert.equal(earlier.length, 400);
  assert.ok(earlier.reduce((n, t) => n + t.text.length, 0) <= 40000);
  assert.equal(batch.input.transcript.at(-1).id, "now");
});

test("rewriting a Story starts it again from the first turn", async () => {
  const { sqlite, store, turn } = fixture();
  turn("t1", "user", "first");
  sqlite.exec(
    `UPDATE stories SET checkpoint='{"turnSequence":9,"turnOffset":0,"items":{}}', session_json='{"steps":[{"title":"Old"}],"map":{"nodes":[]}}', processed_revision=revision, status='ready'`,
  );
  assert.equal(await store.rewrite("c", "u"), 1);
  assert.equal(await store.rewrite("c", "someone-else"), 0);
  const job = await store.claim();
  assert.equal(job.checkpoint.turnSequence, 0);
  assert.equal(job.current, null);
  assert.deepEqual(
    job.turns.map((t) => t.id),
    ["t1"],
  );
});

test("the Story's steps cover the whole session, not only its first stretch", () => {
  assert.match(sessionInstructions, /span the whole session in time order/);
  assert.doesNotMatch(
    sessionInstructions,
    /merge or drop the earliest minor ones/,
  );
});
