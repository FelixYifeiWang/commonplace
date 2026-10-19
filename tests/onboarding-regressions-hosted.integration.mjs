// Synthetic, isolated owner. Never uses a person's account or transcript.
import assert from "node:assert/strict";
import { connect } from "@tursodatabase/serverless";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncTranscript } from "../desktop/collector.mjs";
const origin = process.env.COMMONPLACE_TEST_URL;
if (!origin?.startsWith("https://")) throw Error("Use hosted HTTPS.");
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const owner = "readiness-qa:" + randomUUID(),
  code = randomBytes(32).toString("hex");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const dir = await mkdtemp(join(tmpdir(), "nox-regression-"));
let device;
async function post(path, body, token = device?.token) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}
try {
  await db.run(
    "INSERT INTO pairing_codes(code_hash,owner_id,expires_at) VALUES(?,?,?)",
    [hash(code), owner, Date.now() + 1800000],
  );
  device = await post("/api/setup/claim", { code });
  assert.equal(
    (await db.get("SELECT ready_at FROM devices WHERE id=?", [device.id]))
      .ready_at,
    null,
  );
  await post("/api/setup/ready", { code });
  assert.ok(
    (await db.get("SELECT ready_at FROM devices WHERE id=?", [device.id]))
      .ready_at,
  );
  const sub = await post("/api/subscribe", {
    sessionId: randomUUID(),
    provider: "Codex",
    title: "QA reference",
    mode: "once",
  });
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  await post("/api/capture/media", {
    subscriptionId: sub.subscriptionId,
    kind: "pasted",
    turnId: "qa-image",
    mimeType: "image/png",
    data: png,
    context: "Synthetic visual test",
  });
  await db.run("UPDATE collections SET favorite=1 WHERE id=? AND owner_id=?", [
    sub.collectionId,
    owner,
  ]);
  const { prompt } = await post("/api/device-favorites", {
    id: sub.collectionId,
  });
  const link = prompt.match(/https:\/\/\S+\.md/)?.[0];
  assert.ok(link);
  const text = await (await fetch(link)).text();
  const mediaUrl = text.match(/https:\/\/\S+\.md\/media\/[^\s)]+/)?.[0];
  assert.ok(mediaUrl);
  const media = await fetch(mediaUrl);
  assert.equal(media.status, 200);
  assert.match(media.headers.get("content-type"), /image\/png/);
  assert.deepEqual(
    Buffer.from(await media.arrayBuffer()),
    Buffer.from(png, "base64"),
  );
  assert.equal(
    (await fetch(mediaUrl.replace(/\/media\/.*$/, "/media/" + randomUUID())))
      .status,
    404,
  );
  const token = link.split("/r/")[1].slice(0, -3);
  await db.run(
    "UPDATE collection_reference_links SET expires_at=? WHERE token_hash=?",
    [new Date(0).toISOString(), hash(token)],
  );
  assert.equal((await fetch(mediaUrl)).status, 404);
  await db.run(
    "UPDATE collection_reference_links SET expires_at=? WHERE token_hash=?",
    [new Date(Date.now() + 60000).toISOString(), hash(token)],
  );
  await db.run(
    "UPDATE items SET deleted_at=? WHERE collection_id=? AND owner_id=?",
    [new Date().toISOString(), sub.collectionId, owner],
  );
  assert.equal((await fetch(mediaUrl)).status, 404);
  await db.run(
    "UPDATE items SET deleted_at=NULL WHERE collection_id=? AND owner_id=?",
    [sub.collectionId, owner],
  );
  await post("/api/capture", {
    subscriptionId: sub.subscriptionId,
    turns: [],
    complete: true,
  });
  const file = join(dir, "session.jsonl");
  await writeFile(
    file,
    JSON.stringify({
      uuid: "later",
      message: { role: "user", content: "Do not import this later message" },
    }),
  );
  const subscription = {
    id: sub.subscriptionId,
    file,
    mode: "once",
    historyRemaining: true,
  };
  const result = await syncTranscript({
    connection: { origin, token: device.token },
    subscription,
    cursors: {},
    media: {},
  });
  assert.equal(result.completed, true);
  assert.equal(subscription.historyRemaining, false);
  assert.equal(
    (
      await db.get("SELECT count(*) n FROM turns WHERE session_id=?", [
        sub.subscriptionId,
      ])
    ).n,
    0,
  );
  await db.run("UPDATE devices SET revoked=1 WHERE id=?", [device.id]);
  assert.equal((await fetch(mediaUrl)).status, 404);
  console.log(
    "PASS: pending vs ready; attachment bytes; token expiry, deletion, revocation and item scope; completed import recovery with no new ingestion.",
  );
} finally {
  await db.batch(
    [
      "turns",
      "items",
      "story_beats",
      "stories",
      "sessions",
      "collection_reference_links",
      "collections",
      "pairing_codes",
      "devices",
    ].map((table) => ({
      sql:
        table === "story_beats"
          ? "DELETE FROM story_beats WHERE collection_id IN (SELECT id FROM collections WHERE owner_id=?)"
          : `DELETE FROM ${table} WHERE owner_id=?`,
      args: [owner],
    })),
    "write",
  );
  await db.run("UPDATE blob_deletions SET not_before=0 WHERE owner_id=?", [
    owner,
  ]);
  await db.close();
  await rm(dir, { recursive: true, force: true });
  console.log(
    "Removed isolated QA rows; synthetic image queued for normal storage cleanup.",
  );
}
