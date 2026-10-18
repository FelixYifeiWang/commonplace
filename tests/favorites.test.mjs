import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { favoriteUpdateSQL, overlayFavorites } from "../lib/favorites.mjs";
test("atomic favorite cap, owner isolation, idempotency and freed slots", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE collections(id TEXT,owner_id TEXT,deleted_at TEXT,favorite INTEGER DEFAULT 0)",
  );
  for (let i = 0; i < 7; i++)
    db.prepare("INSERT INTO collections(id,owner_id) VALUES(?,'u')").run(
      String(i),
    );
  const star = (id, owner = "u", value = 1) =>
    db.prepare(favoriteUpdateSQL).get(value, id, owner, value, owner);
  for (let i = 0; i < 5; i++) assert.ok(star(String(i)));
  assert.equal(star("5"), undefined);
  assert.ok(star("0"));
  assert.equal(star("0", "other", 0), undefined);
  assert.ok(star("0", "u", 0));
  assert.ok(star("5"));
  assert.equal(star("6"), undefined);
  db.close();
});
test("pending stars survive background refresh and do not mutate fetched data", () => {
  const data = {
    collections: [
      { id: "a", favorite: false },
      { id: "b", favorite: true },
    ],
  };
  const result = overlayFavorites(
    data,
    new Map([
      ["a", true],
      ["b", false],
    ]),
  );
  assert.deepEqual(
    result.collections.map((c) => c.favorite),
    [true, false],
  );
  assert.equal(data.collections[0].favorite, false);
});
