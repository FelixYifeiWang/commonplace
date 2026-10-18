import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createAccountSpaces } from "../lib/account-spaces.mjs";
function fixture(t) {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync("drizzle/" + file, "utf8"));
  t.after(() => sql.close());
  const prepare = (query, args = []) => ({
    bind: (...a) => prepare(query, a),
    first: async () => sql.prepare(query).get(...args) || null,
    run: async () => sql.prepare(query).run(...args),
  });
  return { sql, spaces: createAccountSpaces({ prepare }) };
}
test("new accounts have separate spaces and never inherit the prototype owner", async (t) => {
  const { spaces } = fixture(t);
  assert.equal(await spaces.owner("user_a"), "account:user_a");
  assert.notEqual(await spaces.owner("user_a"), await spaces.owner("user_b"));
});
test("claim requires proof of the existing signed session", async (t) => {
  const { spaces } = fixture(t);
  assert.equal(await spaces.canClaim("user_a"), false);
  await assert.rejects(spaces.claim("user_a"), /ownership/);
  assert.equal(await spaces.owner("user_a"), "account:user_a");
});
test("only one authenticated account can claim the existing space", async (t) => {
  const { spaces } = fixture(t);
  assert.equal(await spaces.canClaim("user_a", true), true);
  const claims = await Promise.all([
    spaces.claim("user_a", true),
    spaces.claim("user_b", true),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await spaces.owner("user_a"), "hosted-owner");
  assert.equal(await spaces.owner("user_b"), "account:user_b");
  assert.equal(await spaces.canClaim("user_b", true), false);
  assert.equal(await spaces.claim("user_a", true), true);
});
test("an account with existing or deleted content cannot switch away from its space", async (t) => {
  const { spaces, sql } = fixture(t);
  sql
    .prepare(
      "INSERT INTO collections(id,owner_id,name,created_at,deleted_at) VALUES('c','account:user_a','Saved','2026-10-18','2026-10-18')",
    )
    .run();
  assert.equal(await spaces.canClaim("user_a", true), false);
  assert.equal(await spaces.claim("user_a", true), false);
  assert.equal(await spaces.owner("user_a"), "account:user_a");
});
test("an account with a paired device cannot strand that connection by claiming", async (t) => {
  const { spaces, sql } = fixture(t);
  sql
    .prepare(
      "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES('d','account:user_a','Buddy','hash','2026-10-18')",
    )
    .run();
  assert.equal(await spaces.claim("user_a", true), false);
});
test("claim preserves ownership of collections and devices without moving records", async (t) => {
  const { spaces, sql } = fixture(t);
  sql
    .prepare(
      "INSERT INTO collections(id,owner_id,name,created_at) VALUES('old','hosted-owner','Existing','2026-10-18')",
    )
    .run();
  sql
    .prepare(
      "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES('d','hosted-owner','Buddy','hash','2026-10-18')",
    )
    .run();
  await spaces.claim("user_a", true);
  const owner = await spaces.owner("user_a");
  assert.equal(
    sql
      .prepare("SELECT count(*) AS n FROM collections WHERE owner_id=?")
      .get(owner).n,
    1,
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM devices WHERE owner_id=?").get(owner)
      .n,
    1,
  );
});
