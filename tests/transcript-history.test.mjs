import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  appendFile,
  chmod,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  codexTranscripts,
  claudeTranscripts,
} from "../desktop/transcripts.mjs";
import { syncTranscript } from "../desktop/collector.mjs";
const id = "11111111-1111-4111-8111-111111111111";
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "nox-history-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const meta = (id, source = "vscode") =>
  JSON.stringify({
    type: "session_meta",
    payload: { id, source, timestamp: "2026-10-01" },
  }) + "\n";
test("Codex discovers verified history and archives, excluding other sessions and helpers", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "sessions"));
  await mkdir(join(root, "archived_sessions"));
  const old = join(root, "archived_sessions", `rollout-2026-01-01-${id}.jsonl`),
    current = join(root, "sessions", `rollout-2026-02-01-${id}_current.jsonl`);
  const helper = join(
      root,
      "sessions",
      `rollout-2026-01-02-${id}_helper.jsonl`,
    ),
    other = join(root, "sessions", `rollout-2026-01-03-${id}_wrong.jsonl`);
  await writeFile(old, meta(id));
  await writeFile(current, meta(id));
  await writeFile(helper, meta(id, { subagent: { thread_spawn: {} } }));
  await writeFile(other, meta("another"));
  assert.deepEqual(await codexTranscripts(id, root, current), [old, current]);
});
test("Claude combines only matching top-level transcripts across project folders", async (t) => {
  const root = await fixture(t);
  for (const f of ["a", "b", "b/subagents"])
    await mkdir(join(root, f), { recursive: true });
  const a = join(root, "a", `${id}.jsonl`),
    b = join(root, "b", `${id}.jsonl`);
  await writeFile(a, "{}");
  await writeFile(b, "{}");
  await writeFile(join(root, "b", "other.jsonl"), "{}");
  await writeFile(join(root, "b/subagents", `${id}.jsonl`), "{}");
  assert.deepEqual(
    new Set(await claudeTranscripts([id], root)),
    new Set([a, b]),
  );
});
test("all segments backfill once, copied messages deduplicate and active tails keep syncing", async (t) => {
  const root = await fixture(t),
    old = join(root, "old.jsonl"),
    current = join(root, "current.jsonl");
  const line = (text, time) =>
    JSON.stringify({
      type: "response_item",
      timestamp: time,
      payload: { role: "user", content: [{ type: "input_text", text }] },
    }) + "\n";
  const shared = line("Old portfolio reference", "2026-01-01");
  await writeFile(old, shared);
  await writeFile(
    current,
    meta(id) + shared + line("New project", "2026-02-01"),
  );
  const sent = [];
  const args = {
    connection: { origin: "https://example.test", token: "test" },
    subscription: { id: "s", file: current, mode: "follow" },
    cursors: {},
    resolveTranscript: async () => ({ file: current, files: [old, current] }),
    request: async (_, opts) => {
      sent.push(...JSON.parse(opts.body).turns);
      return Response.json({ ok: true });
    },
  };
  await syncTranscript(args);
  assert.deepEqual(
    sent.map((x) => x.text),
    ["Old portfolio reference", "New project"],
  );
  await chmod(old, 0);
  await appendFile(current, line("Latest decision", "2026-03-01"));
  await syncTranscript(args);
  assert.deepEqual(
    sent.map((x) => x.text),
    ["Old portfolio reference", "New project", "Latest decision"],
  );
  assert.equal(args.subscription.historyVersions[old].turns, 1);
});

test("large histories backfill in bounded passes without losing later segments", async (t) => {
  const root = await fixture(t),
    files = [];
  for (let i = 0; i < 15; i++) {
    const f = join(root, `${i}.jsonl`);
    await writeFile(
      f,
      JSON.stringify({ uuid: `m-${i}`, role: "user", content: `Message ${i}` }),
    );
    files.push(f);
  }
  const sent = [];
  const args = {
    connection: { origin: "https://example.test", token: "t" },
    subscription: { id: "s", file: files.at(-1), mode: "follow" },
    cursors: {},
    resolveTranscript: async () => ({ file: files.at(-1), files }),
    request: async (_, opts) => {
      sent.push(...JSON.parse(opts.body).turns.map((t) => t.id));
      return Response.json({ ok: true });
    },
  };
  await syncTranscript(args);
  assert.ok(sent.length < 15);
  assert.deepEqual(sent, ["m-0", "m-1", "m-2", "m-3", "m-4", "m-5"]);
  for (let i = 0; i < 4; i++) await syncTranscript(args);
  assert.equal(new Set(sent).size, 15);
  assert.equal(sent.length, 15);
  assert.deepEqual(
    sent,
    Array.from({ length: 15 }, (_, i) => `m-${i}`),
  );
});

test("history cursors commit only after all batches succeed", async (t) => {
  const root = await fixture(t),
    old = join(root, "old.jsonl"),
    current = join(root, "current.jsonl");
  await writeFile(
    old,
    JSON.stringify({ uuid: "old", role: "user", content: "Earlier reference" }),
  );
  await writeFile(
    current,
    JSON.stringify({ uuid: "new", role: "user", content: "New reference" }),
  );
  const args = {
    connection: { origin: "https://example.test", token: "t" },
    subscription: { id: "s", file: current, mode: "follow" },
    cursors: {},
    resolveTranscript: async () => ({ file: current, files: [old, current] }),
    request: async () => Response.json({ error: "Paused" }, { status: 409 }),
  };
  await assert.rejects(syncTranscript(args), { status: 409 });
  assert.equal(args.subscription.historyVersions, undefined);
  const sent = [];
  args.request = async (_, opts) => {
    sent.push(...JSON.parse(opts.body).turns);
    return Response.json({ ok: true });
  };
  await syncTranscript(args);
  assert.equal(sent.length, 2);
});
test("pasted pictures beyond the upload batch are retried before old history is cached", async (t) => {
  const root = await fixture(t),
    old = join(root, "old.jsonl"),
    current = join(root, "current.jsonl");
  await writeFile(
    old,
    Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({
        uuid: `image-${i}`,
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: Buffer.from(`picture-${i}`).toString("base64"),
              },
            },
            { type: "text", text: `Reference ${i}` },
          ],
        },
      }),
    ).join("\n"),
  );
  await writeFile(current, "{}");
  const uploads = [];
  const args = {
    connection: { origin: "https://example.test", token: "t" },
    subscription: { id: "s", file: current, mode: "follow" },
    cursors: {},
    media: {},
    resolveTranscript: async () => ({ file: current, files: [old, current] }),
    request: async (url, opts) => {
      if (url.endsWith("/media")) uploads.push(JSON.parse(opts.body).data);
      return Response.json({ ok: true });
    },
  };
  await syncTranscript(args);
  assert.equal(uploads.length, 8);
  assert.equal(args.subscription.historyRemaining, true);
  await syncTranscript(args);
  assert.equal(uploads.length, 10);
  assert.equal(args.subscription.historyRemaining, false);
  assert.ok(args.subscription.historyVersions[old]);
});

for (const folder of [false, true])
  test(`one-time ${folder ? "project" : "session"} imports finish only after all pasted images are acknowledged`, async (t) => {
    const root = await fixture(t),
      file = join(root, "once.jsonl");
    await writeFile(
      file,
      Array.from({ length: 10 }, (_, i) =>
        JSON.stringify({
          uuid: `once-${i}`,
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: Buffer.from(`image-${i}`).toString("base64"),
                },
              },
              { type: "text", text: `Picture ${i}` },
            ],
          },
        }),
      ).join("\n"),
    );
    let completed = false;
    const uploaded = new Set();
    const args = {
      connection: { origin: "https://example.test", token: "t" },
      subscription: {
        id: "s",
        file: folder ? root : file,
        folder,
        mode: "once",
      },
      cursors: {},
      media: {},
      resolveTranscript: async () => ({ file, files: [file] }),
      request: async (url, options) => {
        const body = JSON.parse(options.body);
        if (url.endsWith("/media")) {
          uploaded.add(body.data);
          return Response.json({ ok: true });
        }
        if (completed)
          return Response.json(
            { error: "This import is complete." },
            { status: 409 },
          );
        if (body.complete) {
          assert.equal(
            uploaded.size,
            10,
            "completion must follow media acknowledgement",
          );
          completed = true;
        }
        return Response.json({ ok: true });
      },
    };
    await syncTranscript(args);
    assert.equal(completed, false);
    assert.equal(args.subscription.historyRemaining, true);
    await syncTranscript(args);
    assert.equal(uploaded.size, 10);
    assert.equal(completed, true);
    assert.equal(args.subscription.historyRemaining, false);
  });
