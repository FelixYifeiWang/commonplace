// Live HTTPS check. Uses isolated synthetic transcripts, never a user's history.
// Google sign-in is tested separately in the browser and hosted-account check.
import assert from "node:assert/strict";
import { connect } from "@tursodatabase/serverless";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, writeFile, appendFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consumeSetupRequest } from "../desktop/setup-inbox.mjs";
import { syncTranscript } from "../desktop/collector.mjs";
import {
  findSetupSession,
  validateSessionSource,
} from "../desktop/setup-session.mjs";
import { validateManifest } from "../desktop/install.mjs";
const origin = process.env.COMMONPLACE_TEST_URL;
if (!origin?.startsWith("https://"))
  throw new Error("Use the hosted HTTPS test URL.");
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const owner = "onboarding-qa:" + randomUUID(),
  data = await mkdtemp(join(tmpdir(), "commonplace-onboarding-"));
const hash = (s) => createHash("sha256").update(s).digest("hex");
let connection;
const cursors = {};
async function issue(action, source) {
  const code = randomBytes(32).toString("hex");
  await db.run(
    "INSERT INTO pairing_codes(code_hash,owner_id,expires_at) VALUES(?,?,?)",
    [hash(code), owner, Date.now() + 1800000],
  );
  await writeFile(
    join(data, "setup-request.json"),
    JSON.stringify({ id: randomUUID(), origin, code, action, source }),
  );
  return code;
}
async function api(path, body, token = connection?.token) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}
const pair = async (value) => {
  connection = value;
  if (!value.id) throw new Error("Missing device id");
};
const forbidden = async () => {
  throw new Error("Setup accessed a transcript");
};
try {
  const manifest = validateManifest(
    await (await fetch(origin + "/companion/manifest.json")).json(),
  );
  for (const file of manifest.files) {
    const r = await fetch(origin + "/companion/files/" + file.path);
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.length, file.size);
    assert.equal(hash(bytes), file.sha256);
  }
  assert.ok(manifest.files.some((f) => f.path === "desktop/commonplace.icns"));
  console.log(
    "Published installer, native helper and branded assets: checksum verified.",
  );
  assert.equal(
    (await fetch(origin + "/api/setup", { method: "POST" })).status,
    401,
  );
  const code = await issue("setup");
  const result = await consumeSetupRequest(data, {
    origin,
    pair,
    validate: forbidden,
    subscribe: forbidden,
    capture: forbidden,
    report: () => {},
  });
  assert.deepEqual(result, { ok: true, action: "setup" });
  assert.ok(
    (await db.get("SELECT ready_at FROM devices WHERE id=?", [connection.id]))
      .ready_at,
  );
  assert.ok(
    (
      await db.get("SELECT ready_at FROM pairing_codes WHERE code_hash=?", [
        hash(code),
      ])
    ).ready_at,
  );
  assert.equal(
    (
      await db.get("SELECT count(*) n FROM collections WHERE owner_id=?", [
        owner,
      ])
    ).n,
    0,
  );
  const replay = await fetch(origin + "/api/setup/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(replay.status, 410);
  console.log(
    "Fresh pairing confirms ready, creates no collection, reads no transcript; replay rejected.",
  );
  for (const provider of ["Codex", "Claude Code", "Cursor"]) {
    const sessionId = randomUUID(),
      file = join(
        data,
        provider === "Codex"
          ? ".codex/sessions"
          : provider === "Claude Code"
            ? ".claude/projects/qa"
            : ".cursor/projects/qa/agent-transcripts",
        sessionId + ".jsonl",
      );
    await mkdir(join(file, ".."), { recursive: true });
    const line = (id, text) =>
      JSON.stringify(
        provider === "Codex"
          ? {
              type: "response_item",
              payload: {
                type: "message",
                id,
                role: "user",
                content: [{ type: "input_text", text }],
              },
            }
          : {
              uuid: id,
              type: "user",
              message: { role: "user", content: text },
            },
      ) + "\n";
    await writeFile(
      file,
      line(
        "first",
        "A minimal portfolio. Keep generous spacing. Reference https://example.com/design",
      ),
    );
    const connectCode = await issue("connect", {
      file,
      provider,
      sessionId,
      title: "Onboarding QA " + provider,
    });
    await writeFile(
      file,
      line(
        "first",
        "A minimal portfolio. Keep generous spacing. Reference https://example.com/design. Connect " +
          origin +
          "/connect#" +
          connectCode,
      ),
    );
    const sourceOptions = { home: data, codexHome: join(data, ".codex") };
    const selected = await findSetupSession(connectCode, {
      ...sourceOptions,
      linkPath: "/connect",
    });
    assert.equal(selected.provider, provider);
    assert.equal(selected.sessionId, sessionId);
    let subscription;
    const result = await consumeSetupRequest(data, {
      origin,
      connection,
      pair,
      validate: (s) => validateSessionSource(s, sourceOptions),
      report: () => {},
      subscribe: async (source) => {
        const r = await api("/api/subscribe", {
          sessionId: source.sessionId,
          provider,
          title: source.title,
          mode: "follow",
        });
        return (subscription = {
          id: r.subscriptionId,
          collectionId: r.collectionId,
          file,
          mode: "follow",
        });
      },
      capture: async () =>
        syncTranscript({ connection, subscription, cursors }),
    });
    assert.equal(result.ok, true);
    const uploaded = await db.get(
      "SELECT body FROM turns WHERE session_id=? LIMIT 1",
      [subscription.id],
    );
    assert.ok(!uploaded.body.includes(connectCode));
    assert.equal(
      (
        await db.get("SELECT count(*) n FROM turns WHERE session_id=?", [
          subscription.id,
        ])
      ).n,
      1,
    );
    await appendFile(
      file,
      line(
        "second",
        "Use a black and white palette. Reference https://example.com/layout",
      ),
    );
    const updated = await syncTranscript({ connection, subscription, cursors });
    assert.equal(updated.captured, 1);
    assert.equal(
      (await syncTranscript({ connection, subscription, cursors })).captured,
      0,
    );
    assert.equal(
      (
        await db.get("SELECT count(*) n FROM turns WHERE session_id=?", [
          subscription.id,
        ])
      ).n,
      2,
    );
    const repeated = await api("/api/subscribe", {
      sessionId,
      provider,
      mode: "follow",
    });
    assert.equal(repeated.collectionId, subscription.collectionId);
    // Simulate the stored deletion state used by the authenticated UI; test collector respects it.
    const item = await db.get(
      "SELECT id FROM items WHERE session_id=? LIMIT 1",
      [subscription.id],
    );
    assert.ok(item);
    await db.run("UPDATE items SET deleted_at=? WHERE id=?", [
      new Date().toISOString(),
      item.id,
    ]);
    await syncTranscript({ connection, subscription, cursors: {} });
    assert.ok(
      (await db.get("SELECT deleted_at FROM items WHERE id=?", [item.id]))
        .deleted_at,
    );
    await db.run("UPDATE sessions SET state='paused' WHERE id=?", [
      subscription.id,
    ]);
    await assert.rejects(
      syncTranscript({ connection, subscription, cursors }),
      (e) => e.status === 409,
    );
    console.log(
      provider +
        ": explicit connection, live append, deduplication, deletion persistence and pause passed.",
    );
  }
  assert.equal(
    (await db.get("SELECT count(*) n FROM devices WHERE owner_id=?", [owner]))
      .n,
    1,
  );
  await db.run("UPDATE devices SET revoked=1 WHERE owner_id=?", [owner]);
  const r = await fetch(origin + "/api/subscribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId: "revoked", provider: "Codex" }),
  });
  assert.equal(r.status, 401);
  console.log("One device reused across setup; revoked device cannot connect.");
} finally {
  await db.batch(
    [
      ...[
        "turns",
        "items",
        "story_beats",
        "stories",
        "sessions",
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
    ],
    "write",
  );
  await db.close();
  await rm(data, { recursive: true, force: true });
  console.log("Removed only this run's QA fixtures.");
}
