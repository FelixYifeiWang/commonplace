import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createSessionMediaStore } from "../lib/session-media-store.mjs";
import { parseMediaUpload } from "../lib/session-media.mjs";

const png64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ARTIFACT = "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4";

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
  sqlite.exec(
    "INSERT INTO collections(id,owner_id,name,created_at) VALUES('c','u','Newron','2026-10-18');" +
      "INSERT INTO sessions(id,owner_id,collection_id,title,provider,token_hash,created_at) VALUES('s','u','c','Newron','Claude Code','x','2026-10-18');",
  );
  const stored = [];
  const store = createSessionMediaStore(
    { prepare: make },
    {
      now: () => "2026-10-19T00:00:00.000Z",
      put: async (file) => {
        stored.push(file);
        return `users/u/${stored.length}/${file.name}`;
      },
    },
  );
  const session = { id: "s", ownerId: "u", collectionId: "c" };
  const rows = () =>
    sqlite
      .prepare(
        "SELECT kind,title,url,image_url AS imageUrl,file_key AS fileKey,source_role AS sourceRole,source_turn AS sourceTurn,source_text AS sourceText,preview_status AS previewStatus FROM items ORDER BY created_at, rowid",
      )
      .all()
      .map((row) => ({ ...row }));
  return { sqlite, store, session, stored, rows };
}

test("a pasted image becomes the human's own image item, with the words they wrote around it", async () => {
  const { store, session, stored, rows } = fixture();
  await store.save(
    session,
    parseMediaUpload({
      kind: "pasted",
      turnId: "u1",
      mimeType: "image/png",
      data: png64,
      context: "make this a reference for the canvas",
    }),
  );
  assert.equal(stored.length, 1);
  assert.deepEqual(rows(), [
    {
      kind: "image",
      title: "Pasted image",
      url: null,
      imageUrl: null,
      fileKey: "users/u/1/pasted.png",
      sourceRole: "user",
      sourceTurn: "u1",
      sourceText: "make this a reference for the canvas",
      previewStatus: "ready",
    },
  ]);
});

test("the same pasted image is stored once, however often it is sent", async () => {
  const { store, session, stored, rows } = fixture();
  const upload = parseMediaUpload({
    kind: "pasted",
    turnId: "u1",
    mimeType: "image/png",
    data: png64,
  });
  await store.save(session, upload);
  const again = await store.save(session, { ...upload, turnId: "u9" });
  assert.equal(again.duplicate, true);
  assert.equal(stored.length, 1);
  assert.equal(rows().length, 1);
});

test("an artifact capture becomes the picture of its link, replacing the generic cover", async () => {
  const { sqlite, store, session, rows } = fixture();
  const identity = await store.linkIdentity(ARTIFACT);
  sqlite
    .prepare(
      "INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,url,image_url,source_text,source_role,source_turn,created_at,updated_at) VALUES('l','u','s','c',?,'link','PkxxssFTMZtnyjsktQMNM4',?,'https://claude.ai/images/claude_ogimage.png','see the mockup','assistant','t1','2026-10-18','2026-10-18')",
    )
    .run(identity, ARTIFACT);
  const capture = parseMediaUpload({
    kind: "artifact",
    turnId: "a1",
    mimeType: "image/png",
    data: png64,
    url: ARTIFACT,
    title: "Portfolio Story",
  });
  const saved = await store.save(session, capture);
  assert.equal(saved.itemId, "l");
  const [link] = rows();
  assert.equal(link.kind, "link");
  assert.equal(link.imageUrl, null);
  assert.equal(link.fileKey, "users/u/1/capture.png");
  assert.equal(link.previewStatus, "ready");
  assert.equal(link.sourceTurn, "t1");
});

test("a capture of an artifact the conversation never linked adds the link", async () => {
  const { store, session, rows } = fixture();
  await store.save(
    session,
    parseMediaUpload({
      kind: "artifact",
      turnId: "a1",
      mimeType: "image/png",
      data: png64,
      url: ARTIFACT,
      title: "Portfolio Story",
      context: "Story mockup",
    }),
  );
  assert.deepEqual(rows(), [
    {
      kind: "link",
      title: "Portfolio Story",
      url: ARTIFACT,
      imageUrl: null,
      fileKey: "users/u/1/capture.png",
      sourceRole: "assistant",
      sourceTurn: "a1",
      sourceText: "Story mockup",
      previewStatus: "ready",
    },
  ]);
});

test("a picture saved after the turns asks the Story to refresh its canvases", async () => {
  const { sqlite, store, session } = fixture();
  const before = sqlite
    .prepare("SELECT revision FROM stories WHERE collection_id='c'")
    .get();
  await store.save(
    session,
    parseMediaUpload({
      kind: "artifact",
      turnId: "a1",
      mimeType: "image/png",
      data: png64,
      url: ARTIFACT,
      title: "Portfolio Story",
    }),
  );
  const after = sqlite
    .prepare(
      "SELECT revision, visual_refresh AS visualRefresh, status FROM stories WHERE collection_id='c'",
    )
    .get();
  assert.equal(after.visualRefresh, 1);
  assert.ok(after.revision > before.revision);
  assert.equal(after.status, "pending");
});
