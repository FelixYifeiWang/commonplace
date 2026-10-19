import assert from "node:assert/strict";
import { connect } from "@tursodatabase/serverless";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const origin = process.env.COMMONPLACE_TEST_URL;
if (!origin?.startsWith("https://")) throw Error("Use hosted HTTPS.");
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const owner = "reference-qa:" + randomUUID(),
  token = randomBytes(32).toString("hex"),
  ids = Array.from({ length: 6 }, () => randomUUID());
const request = (id, auth = token) =>
  fetch(origin + "/api/device-favorites", {
    method: id ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    ...(id ? { body: JSON.stringify({ id }) } : {}),
  });
try {
  await db.run(
    "INSERT INTO devices(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)",
    [
      randomUUID(),
      owner,
      "Reference QA",
      createHash("sha256").update(token).digest("hex"),
      new Date().toISOString(),
    ],
  );
  for (const [i, id] of ids.entries())
    await db.run(
      "INSERT INTO collections(id,owner_id,name,created_at,favorite) VALUES(?,?,?,?,?)",
      [id, owner, "Reference " + i, new Date().toISOString(), i < 5 ? 1 : 0],
    );
  const now = new Date().toISOString();
  for (const [i, url] of [
    "https://example.com/reference",
    "https://mail.google.com/mail/u/0/",
  ].entries())
    await db.run(
      "INSERT INTO items(id,owner_id,collection_id,identity,kind,title,body,url,source_text,source_role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        randomUUID(),
        owner,
        ids[0],
        "qa" + i,
        "link",
        "Source " + i,
        "Use a quiet layout.",
        url,
        "A chosen source",
        "user",
        now,
        now,
      ],
    );
  const list = await request();
  assert.equal(list.status, 200);
  assert.equal((await list.json()).collections.length, 5);
  const ref = await request(ids[0]);
  assert.equal(ref.status, 200);
  const { prompt } = await ref.json();
  const link = prompt.match(/https:\/\/\S+\.md/)?.[0];
  assert.ok(link);
  const markdown = await (await fetch(link)).text();
  assert.match(markdown, /example.com\/reference/);
  assert.doesNotMatch(markdown, /mail.google.com/);
  assert.equal((await request(ids[5])).status, 404);
  assert.equal((await request("another-owners-collection")).status, 404);
  assert.equal((await request(undefined, "invalid")).status, 401);
  await db.run("UPDATE devices SET revoked=1 WHERE owner_id=?", [owner]);
  assert.equal((await request(ids[0])).status, 401);
  assert.equal(
    (await db.get("SELECT count(*) n FROM sessions WHERE owner_id=?", [owner]))
      .n,
    0,
  );
  console.log(
    "Hosted reference prompts: five favorites, source content, filtering, ownership, revocation, no subscription side effects passed.",
  );
} finally {
  await db.batch(
    [
      "collection_reference_links",
      "items",
      "stories",
      "collections",
      "devices",
    ].map((table) => ({
      sql: `DELETE FROM ${table} WHERE owner_id=?`,
      args: [owner],
    })),
    "write",
  );
  await db.close();
  console.log("Removed isolated reference QA fixtures.");
}
