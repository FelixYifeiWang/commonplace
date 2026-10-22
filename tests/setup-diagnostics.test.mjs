import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  sanitizeSetupReport,
  storeSetupReport,
} from "../lib/setup-diagnostics.mjs";
test("diagnostics redact credentials, private links, paths and emails and bound evidence", () => {
  const report = sanitizeSetupReport({
    reporter: "agent",
    stage: "download",
    evidence:
      "https://newron.app/setup.md#" +
      "a".repeat(64) +
      " sk-proj-abcdefghijk person@example.com /Users/alice/project/.env Bearer abcdefghijklmnop",
    rootCause: "unknown",
    confidence: "unknown",
    suggestedFix: "x".repeat(12000),
    environment: "macOS",
  });
  const text = JSON.stringify(report);
  for (const secret of [
    "a".repeat(64),
    "abcdefghijk",
    "person@example.com",
    "/Users/alice",
    "abcdefghijklmnop",
  ])
    assert.ok(!text.includes(secret));
  assert.ok(report.suggestedFix.length <= 2000);
  assert.throws(() => sanitizeSetupReport({ reporter: "other" }));
});
test("reports require a live setup code, remain bounded and never consume pairing", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const f of readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      db.exec(readFileSync("drizzle/" + f, "utf8"));
    const adapter = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              run: async () => ({
                meta: { changes: Number(db.prepare(sql).run(...args).changes) },
              }),
            };
          },
        };
      },
    };
    db.prepare(
      "INSERT INTO pairing_codes(code_hash,owner_id,expires_at) VALUES(?,?,?)",
    ).run("hash", "owner", 1000);
    const report = sanitizeSetupReport({
      reporter: "agent",
      stage: "download",
      evidence: "ENOTFOUND",
      rootCause: "unknown",
      confidence: "unknown",
    });
    assert.equal(
      await storeSetupReport(adapter, "missing", report, 500),
      false,
    );
    assert.equal(await storeSetupReport(adapter, "hash", report, 1000), false);
    assert.equal(await storeSetupReport(adapter, "hash", report, 500), true);
    assert.equal(await storeSetupReport(adapter, "hash", report, 501), true);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM setup_reports").get().n, 1);
    assert.equal(
      db.prepare("SELECT claim_id FROM pairing_codes").get().claim_id,
      null,
    );
    assert.equal(
      db.prepare("SELECT owner_id FROM setup_reports").get().owner_id,
      "owner",
    );
  } finally {
    db.close();
  }
});
