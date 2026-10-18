// Disposable transcript + real API flow. Does not install a service or read existing sessions.
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  appendFile,
  readdir,
  rm,
} from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findSetupSession,
  validateSessionSource,
} from "../desktop/setup-session.mjs";
import { consumeSetupRequest } from "../desktop/setup-inbox.mjs";
import { syncTranscript } from "../desktop/collector.mjs";
const origin = "http://127.0.0.1:3100",
  home = await mkdtemp(join(tmpdir(), "commonplace-onboarding-"));
const ids = [],
  deviceIds = [],
  codes = [];
async function api(path, body, token) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(token
        ? { Authorization: "Bearer " + token }
        : { Cookie: "__sites_local_auth=1" }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  return r.json();
}
try {
  assert.equal(
    (await fetch(origin + "/api/setup", { method: "POST" })).status,
    401,
  );
  const installation = await api("/api/setup", {});
  const installCode = new URL(installation.link).hash.slice(1);
  codes.push(installCode);
  const installData = join(home, "setup-only");
  await mkdir(installData);
  await writeFile(
    join(installData, "setup-request.json"),
    JSON.stringify({
      id: crypto.randomUUID(),
      origin,
      code: installCode,
      action: "setup",
    }),
  );
  const forbidden = () => {
    throw new Error("Setup attempted transcript access");
  };
  const prepared = await consumeSetupRequest(installData, {
    origin,
    validate: forbidden,
    subscribe: forbidden,
    capture: forbidden,
    pair: async (device) => deviceIds.push(device.id),
    report: () => {},
  });
  assert.deepEqual(prepared, { ok: true, action: "setup" });
  console.log("Setup paired without reading or creating a session.");
  for (const provider of ["Codex", "Claude Code", "Cursor"]) {
    const setup = await api("/api/setup", {});
    setup.link = setup.link.replace(/\/setup(?:\.md)?#/, "/connect#");
    const code = new URL(setup.link).hash.slice(1);
    codes.push(code);
    const sid = crypto.randomUUID(),
      file = join(
        home,
        provider === "Codex"
          ? `.codex/sessions/2026/10/17/rollout-${sid}.jsonl`
          : provider === "Claude Code"
            ? `.claude/projects/qa/${sid}.jsonl`
            : `.cursor/projects/qa/agent-transcripts/${sid}/${sid}.jsonl`,
      );
    await mkdir(join(file, ".."), { recursive: true });
    const row = (text) =>
      JSON.stringify(
        provider === "Codex"
          ? { type: "response_item", payload: { role: "user", content: text } }
          : provider === "Claude Code"
            ? { message: { role: "user", content: text } }
            : { role: "user", message: { content: [{ type: "text", text }] } },
      ) + "\n";
    await writeFile(
      file,
      row("Set up " + setup.link) + row("Reference https://example.com/first"),
    );
    const source = await findSetupSession(code, { home, linkPath: "/connect" });
    assert.equal(source.provider, provider);
    const data = join(home, "data-" + sid);
    await mkdir(data);
    await writeFile(
      join(data, "setup-request.json"),
      JSON.stringify({ id: sid, origin, code, action: "connect", source }),
    );
    let connection, subscription;
    const cursors = {};
    const result = await consumeSetupRequest(data, {
      origin,
      validate: (s) => validateSessionSource(s, { home }),
      pair: async (value) => {
        connection = value;
        deviceIds.push(value.id);
      },
      subscribe: async (value) => {
        const sub = await api(
          "/api/subscribe",
          { ...value, mode: "follow" },
          connection.token,
        );
        ids.push(sub.collectionId);
        return (subscription = {
          id: sub.subscriptionId,
          file,
          mode: "follow",
        });
      },
      capture: async (_source, sub) =>
        syncTranscript({ connection, subscription: sub, cursors }),
      report: () => {},
    });
    assert.equal(result.ok, true, result.error);
    const replay = await fetch(origin + "/api/setup/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    assert.equal(replay.status, 410);
    await appendFile(file, row("Next reference https://example.com/second"));
    await syncTranscript({ connection, subscription, cursors });
    const workspace = await api("/api/workspace");
    assert.equal(
      workspace.items.filter((i) => i.collectionId === ids.at(-1)).length,
      2,
    );
    const again = await api("/api/setup", {});
    codes.push(new URL(again.link).hash.slice(1));
    const reused = await api("/api/setup/claim", {
      code: codes.at(-1),
      deviceToken: connection.token,
    });
    assert.equal(reused.id, connection.id);
    assert.equal(reused.token, connection.token);
    console.log(
      provider +
        ": prompt matched, initial capture and later updates arrived, pairing replay rejected, device reused.",
    );
  }
} finally {
  const root = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const file = (await readdir(root)).find(
    (n) => n.endsWith(".sqlite") && !n.includes("metadata"),
  );
  const db = new DatabaseSync(join(root, file));
  db.exec("PRAGMA busy_timeout=5000; BEGIN");
  for (const id of ids) {
    for (const table of ["story_beats", "stories", "items"])
      db.prepare(`DELETE FROM ${table} WHERE collection_id=?`).run(id);
    db.prepare(
      "DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE collection_id=?)",
    ).run(id);
    db.prepare("DELETE FROM sessions WHERE collection_id=?").run(id);
    db.prepare("DELETE FROM collections WHERE id=?").run(id);
  }
  for (const id of deviceIds)
    db.prepare("DELETE FROM devices WHERE id=?").run(id);
  for (const code of codes) {
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)),
    ).toString("hex");
    db.prepare("DELETE FROM pairing_codes WHERE code_hash=?").run(hash);
  }
  db.exec("COMMIT");
  db.close();
  await rm(home, { recursive: true, force: true });
  console.log("Removed onboarding fixtures.");
}
