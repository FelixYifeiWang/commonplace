import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { referenceLinkQuery, referencePrompt } from "../lib/reference-link.mjs";
test("private collection links enforce expiry, ownership, favorites and device revocation", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE collections(id,owner_id,name,description,deleted_at,favorite);
      CREATE TABLE devices(id,owner_id,revoked);
      CREATE TABLE collection_reference_links(token_hash,owner_id,collection_id,device_id,expires_at);
      INSERT INTO collections VALUES('c','a','Reference','',NULL,1),('other','b','Private','',NULL,1);
      INSERT INTO devices VALUES('d','a',0);
      INSERT INTO collection_reference_links VALUES('valid','a','c','d','2026-11-01'),('cross-owner','a','other','d','2026-11-01');`);
    const read = (token = "valid", now = "2026-10-20") =>
      db.prepare(referenceLinkQuery).get(token, now);
    assert.equal(read().name, "Reference");
    assert.equal(read("unknown"), undefined);
    assert.equal(read("cross-owner"), undefined);
    assert.equal(read("valid", "2026-11-01"), undefined);
    for (const [change, restore] of [
      ["UPDATE devices SET revoked=1", "UPDATE devices SET revoked=0"],
      ["UPDATE devices SET owner_id='b'", "UPDATE devices SET owner_id='a'"],
      [
        "UPDATE collections SET favorite=0 WHERE id='c'",
        "UPDATE collections SET favorite=1 WHERE id='c'",
      ],
      [
        "UPDATE collections SET deleted_at='2026-10-20' WHERE id='c'",
        "UPDATE collections SET deleted_at=NULL WHERE id='c'",
      ],
    ]) {
      db.exec(change);
      assert.equal(read(), undefined);
      db.exec(restore);
    }
  } finally {
    db.close();
  }
});
test("copied prompt stays one short sentence without collection contents or device credentials", () => {
  const prompt = referencePrompt("https://newron.app", "a".repeat(48));
  assert.equal(
    prompt,
    `Use https://newron.app/r/${"a".repeat(48)}.md as reference for this task.`,
  );
  assert.ok(prompt.length < 120);
});

test("private reference links never become gallery sources or model evidence", async () => {
  const { redactReferenceLinks } = await import("../lib/protocol.mjs");
  const { redactSetupLinks } = await import("../desktop/setup-session.mjs");
  const { redactStoryText } = await import("../lib/story.mjs");
  const { isReferenceUrl } = await import("../lib/source-policy.mjs");
  const link = `https://newron.app/r/${"a".repeat(48)}.md`;
  assert.equal(isReferenceUrl(link), false);
  assert.equal(redactSetupLinks(link), "[private collection reference]");
  assert.equal(redactReferenceLinks(link), "[private collection reference]");
  assert.equal(
    redactStoryText(link, { preserveLength: true }).length,
    link.length,
  );
  assert.ok(!redactStoryText(link).includes("a".repeat(48)));
});
