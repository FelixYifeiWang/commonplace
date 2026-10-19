import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createSharedCollectionStore } from "../lib/shared-collection.mjs";
import { mediaPath, imageSource } from "../lib/media-source.mjs";
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
  });
  sqlite.exec(
    "INSERT INTO collections(id,owner_id,name,created_at) VALUES ('a','owner-a','Project A','2026-10-18'),('b','owner-b','Project B','2026-10-18')",
  );
  const add = (
    id,
    collection = "a",
    deleted = null,
    url = "https://example.com/article",
  ) =>
    sqlite
      .prepare(
        "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,url,image_url,file_key,source_text,source_role,source_turn,deleted_at,created_at,updated_at) VALUES(?,?,?,?,'link','A reference','Visible description',?,'https://example.com/cover.png','private/key','PRIVATE TRANSCRIPT','user','PRIVATE TURN',?,'2026-10-18','2026-10-18')",
      )
      .run(id, "owner-" + collection, collection, id, url, deleted);
  return { sqlite, add, store: createSharedCollectionStore({ prepare: make }) };
}
test("link views expose one collection without account or raw session metadata", async () => {
  const { sqlite, add, store } = fixture();
  try {
    add("one");
    add("other", "b");
    const data = await store.get("a");
    assert.equal(data.collection.name, "Project A");
    assert.deepEqual(
      data.items.map((i) => i.id),
      ["one"],
    );
    const json = JSON.stringify(data);
    for (const secret of [
      "owner-a",
      "owner-b",
      "PRIVATE TRANSCRIPT",
      "PRIVATE TURN",
      "private/key",
      "Project B",
    ])
      assert.equal(json.includes(secret), false);
    assert.equal(data.items[0].sharedCollectionId, "a");
    assert.equal(data.items[0].fileKey, "attached");
  } finally {
    sqlite.close();
  }
});
test("shared media requires the exact live collection and never includes trash or utility pages", async () => {
  const { sqlite, add, store } = fixture();
  try {
    add("one");
    add("other", "b");
    add("deleted", "a", "2026-10-18");
    add("auth", "a", null, "https://auth.openai.com/log-in");
    assert.ok(await store.media("a", "one"));
    for (const id of ["other", "deleted", "auth"])
      assert.equal(await store.media("a", id), null);
    assert.deepEqual(
      (await store.get("a")).items.map((i) => i.id),
      ["one"],
    );
    sqlite.exec("UPDATE collections SET deleted_at='2026-10-18' WHERE id='a'");
    assert.equal(await store.get("a"), null);
    assert.equal(await store.media("a", "one"), null);
    assert.equal(await store.story("a"), null);
  } finally {
    sqlite.close();
  }
});
test("shared story reads do not enqueue generation or expose internal state", async () => {
  const { sqlite, add, store } = fixture();
  try {
    add("one");
    sqlite.exec(
      "UPDATE stories SET lease_token='PRIVATE LEASE',checkpoint='{\"private\":true}',error='PRIVATE ERROR' WHERE collection_id='a'",
    );
    const before = sqlite
      .prepare("SELECT * FROM stories WHERE collection_id='a'")
      .get();
    const story = await store.story("a");
    assert.ok(story.session || story.previewSession);
    assert.equal(story.error, null);
    assert.equal(JSON.stringify(story).includes("PRIVATE"), false);
    assert.deepEqual(
      sqlite.prepare("SELECT * FROM stories WHERE collection_id='a'").get(),
      before,
    );
  } finally {
    sqlite.close();
  }
});
test("shared media uses collection-scoped routes while owner media routes stay unchanged", () => {
  const item = {
    id: "b3319471-f6fb-400b-b8ff-718dce83ff00",
    kind: "link",
    imageUrl: "https://example.com/a.png",
    updatedAt: "now",
  };
  assert.equal(imageSource(item), `/api/images/${item.id}?v=now&p=2`);
  const shared = { ...item, sharedCollectionId: "session-abc" };
  assert.equal(
    imageSource(shared),
    `/api/shared/session-abc/media/${item.id}/image?v=now&p=2`,
  );
  assert.equal(
    mediaPath(shared, "file"),
    `/api/shared/session-abc/media/${item.id}/file`,
  );
  assert.equal(
    mediaPath(shared, "screenshot"),
    `/api/shared/session-abc/media/${item.id}/screenshot?v=3`,
  );
});

test("disconnect keeps the same shared collection URL and its media available", async () => {
  const { sqlite, add, store } = fixture();
  try {
    add("one");
    const before = await store.get("a");
    sqlite.exec("UPDATE collections SET frozen_at='2026-10-19' WHERE id='a'");
    assert.deepEqual(await store.get("a"), before);
    assert.ok(await store.media("a", "one"));
    assert.equal((await store.story("a")).pending, false);
  } finally {
    sqlite.close();
  }
});
