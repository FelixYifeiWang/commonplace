import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { connect } from "@tursodatabase/serverless";
const origin = process.env.COMMONPLACE_TEST_URL;
if (!origin?.startsWith("https://")) throw new Error("Use hosted HTTPS.");
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const owner = "diagnostics-qa:" + randomUUID(),
  code = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(code).digest("hex");
const post = (body) =>
  fetch(origin + "/api/setup/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
try {
  await db.run(
    "INSERT INTO pairing_codes(code_hash,owner_id,expires_at) VALUES(?,?,?)",
    [hash, owner, Date.now() + 1800000],
  );
  assert.equal((await post({ code: "bad" })).status, 400);
  assert.equal(
    (
      await post({
        code: randomBytes(32).toString("hex"),
        report: { reporter: "agent" },
      })
    ).status,
    410,
  );
  const body = {
    code,
    report: {
      reporter: "agent",
      stage: "preflight",
      evidence: "ENOTFOUND sk-proj-testCredential0123 alice@example.com",
      rootCause: "unknown",
      confidence: "unknown",
      suggestedFix: "Check network permission",
    },
  };
  assert.equal((await post(body)).status, 200);
  assert.equal((await post(body)).status, 200);
  const rows = await db.all(
    "SELECT report FROM setup_reports WHERE owner_id=?",
    [owner],
  );
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].report.includes("testCredential0123"));
  assert.ok(!rows[0].report.includes("alice@example.com"));
  assert.equal(
    (
      await db.get("SELECT claim_id FROM pairing_codes WHERE code_hash=?", [
        hash,
      ])
    ).claim_id,
    null,
  );
  await db.run("UPDATE pairing_codes SET expires_at=0 WHERE code_hash=?", [
    hash,
  ]);
  assert.equal((await post(body)).status, 410);
  console.log(
    "Hosted diagnostics: auth, expiry, redaction, deduplication and pairing isolation passed.",
  );
} finally {
  await db.batch(
    [
      { sql: "DELETE FROM setup_reports WHERE owner_id=?", args: [owner] },
      { sql: "DELETE FROM pairing_codes WHERE owner_id=?", args: [owner] },
    ],
    "write",
  );
  await db.close();
}
