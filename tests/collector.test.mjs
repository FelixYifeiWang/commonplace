import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  appendFile,
  rm,
  symlink,
  utimes,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncTranscript } from "../desktop/collector.mjs";

async function fixture(t, count = 1) {
  const dir = await mkdtemp(join(tmpdir(), "commonplace-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "session.jsonl");
  await writeFile(
    file,
    Array.from({ length: count }, (_, i) =>
      JSON.stringify({
        type: "user",
        uuid: `turn-${i}`,
        message: {
          role: "user",
          content: `Reference ${i} https://example.com/${i}`,
        },
      }),
    ).join("\n"),
  );
  return {
    connection: { origin: "https://example.test", token: "test-only" },
    subscription: { id: "selected", file, mode: "follow" },
    cursors: {},
  };
}
const ok = () => Response.json({ ok: true });
test("a repeated transcript sends no duplicate turns", async (t) => {
  const args = await fixture(t),
    sent = [];
  args.request = async (_url, opts) => {
    sent.push(JSON.parse(opts.body).turns.length);
    return ok();
  };
  await syncTranscript(args);
  await syncTranscript(args);
  assert.deepEqual(sent, [1, 0]);
});
test("a paused write does not advance the cursor", async (t) => {
  const args = await fixture(t);
  args.request = async () =>
    Response.json({ error: "Paused" }, { status: 409 });
  await assert.rejects(syncTranscript(args), { status: 409 });
  assert.deepEqual(args.cursors, {});
});
test("one-time imports complete only after their last batch", async (t) => {
  const args = await fixture(t, 21),
    batches = [];
  args.subscription.mode = "once";
  args.request = async (_url, opts) => {
    batches.push(JSON.parse(opts.body).complete);
    return ok();
  };
  await syncTranscript(args);
  assert.deepEqual(batches, [false, false, true]);
});
test("an authentication HTML response is never treated as successful ingestion", async (t) => {
  const args = await fixture(t);
  args.request = async () =>
    new Response("<html>Sign in</html>", {
      headers: { "Content-Type": "text/html" },
    });
  await assert.rejects(syncTranscript(args), /Sign in/);
});

test("a transcript larger than 25 MB imports references after large tool output", async (t) => {
  const args = await fixture(t);
  const { appendFile } = await import("node:fs/promises");
  const toolLine =
    JSON.stringify({ type: "tool", content: "x".repeat(1024 * 1024) }) + "\n";
  await writeFile(args.subscription.file, "");
  for (let i = 0; i < 26; i++)
    await appendFile(args.subscription.file, toolLine);
  await appendFile(
    args.subscription.file,
    JSON.stringify({ role: "user", content: "https://are.na" }),
  );
  const sent = [];
  args.request = async (_url, opts) => {
    sent.push(...JSON.parse(opts.body).turns);
    return ok();
  };
  await syncTranscript(args);
  assert.deepEqual(
    sent.map(({ id, text }) => ({ id, text })),
    [{ id: "line-26", text: "https://are.na" }],
  );
});

test("retry after a failed batch sends only unacknowledged turns", async (t) => {
  const args = await fixture(t, 21);
  let calls = 0;
  args.request = async () =>
    ++calls === 2
      ? Response.json({ error: "Unavailable" }, { status: 503 })
      : ok();
  await assert.rejects(syncTranscript(args), { status: 503 });
  const sent = [];
  args.request = async (_url, opts) => {
    sent.push(...JSON.parse(opts.body).turns);
    return ok();
  };
  await syncTranscript(args);
  assert.deepEqual(
    sent.map((turn) => turn.id),
    Array.from({ length: 11 }, (_, i) => `turn-${i + 10}`),
  );
});

test("growing JSONL preserves line IDs and waits for partial records", async (t) => {
  const args = await fixture(t);
  const { appendFile } = await import("node:fs/promises");
  await writeFile(
    args.subscription.file,
    '\n{"role":"user","content":"你好"}\n{"role":"assistant","content":"par',
  );
  const sent = [];
  args.request = async (_url, opts) => {
    sent.push(...JSON.parse(opts.body).turns);
    return ok();
  };
  await syncTranscript(args);
  await appendFile(args.subscription.file, 'tial"}\n');
  await syncTranscript(args);
  assert.deepEqual(
    sent.map(({ id, text }) => ({ id, text })),
    [
      { id: "line-1", text: "你好" },
      { id: "line-2", text: "partial" },
    ],
  );
});
test("a followed project sends every session in its folder, oldest first", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "commonplace-project-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const project = join(dir, "project");
  await mkdir(join(project, "older", "subagents"), { recursive: true });
  const line = (id, text) =>
    JSON.stringify({ uuid: id, message: { role: "user", content: text } });
  await writeFile(join(project, "newer.jsonl"), line("b", "Second session"));
  await writeFile(join(project, "older.jsonl"), line("a", "First session"));
  await utimes(join(project, "older.jsonl"), 1, 1);
  await writeFile(
    join(project, "older", "subagents", "agent.jsonl"),
    line("c", "Subagent"),
  );
  await writeFile(join(dir, "private.jsonl"), line("d", "Private"));
  await symlink(join(dir, "private.jsonl"), join(project, "escape.jsonl"));
  const sent = [];
  await syncTranscript({
    connection: { origin: "https://example.test", token: "test-only" },
    subscription: {
      id: "project",
      file: project,
      folder: true,
      mode: "follow",
    },
    cursors: {},
    request: async (_url, opts) => {
      sent.push(...JSON.parse(opts.body).turns.map((turn) => turn.text));
      return ok();
    },
  });
  assert.deepEqual(sent, ["First session", "Second session"]);
});
test("a followed project does not read unchanged transcripts again", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "commonplace-project-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const line = (id, text) =>
    JSON.stringify({ uuid: id, message: { role: "user", content: text } }) +
    "\n";
  const done = join(dir, "done.jsonl"),
    active = join(dir, "active.jsonl");
  await writeFile(done, line("a", "Finished session"));
  await writeFile(active, line("b", "Active session"));
  // Files can share a timestamp on CI filesystems; make the intended order explicit.
  await utimes(done, 1, 1);
  await utimes(active, 2, 2);
  const sent = [];
  const args = {
    connection: { origin: "https://example.test", token: "test-only" },
    subscription: { id: "project", file: dir, folder: true, mode: "follow" },
    cursors: {},
    request: async (_url, opts) => {
      sent.push(...JSON.parse(opts.body).turns.map((turn) => turn.text));
      return ok();
    },
  };
  await syncTranscript(args);
  // An unreadable file proves the unchanged transcript is skipped rather than re-parsed.
  await chmod(done, 0o000);
  await appendFile(active, line("c", "New turn"));
  const result = await syncTranscript(args);
  assert.deepEqual(sent, ["Finished session", "Active session", "New turn"]);
  assert.equal(result.total, 3);
});

test("rotation drains the old tail and follows new turns without replaying acknowledged ones", async (t) => {
  const args = await fixture(t);
  const sent = [];
  args.request = async (_url, opts) => {
    sent.push(...JSON.parse(opts.body).turns);
    return ok();
  };
  await syncTranscript(args);
  const oldFile = args.subscription.file;
  const nextFile = join(oldFile, "..", "resumed.jsonl");
  await appendFile(
    oldFile,
    "\n" +
      JSON.stringify({
        id: "tail",
        role: "user",
        content: "Last old-file decision",
      }),
  );
  await writeFile(
    nextFile,
    JSON.stringify({
      id: "rename",
      role: "user",
      content: "The project is renamed to Newron.",
    }),
  );
  args.resolveTranscript = async () => ({
    file: nextFile,
    sessionId: "stable-thread",
  });
  await syncTranscript(args);
  await syncTranscript(args);
  assert.deepEqual(
    sent.map((t) => t.id),
    ["turn-0", "tail", "rename"],
  );
  assert.equal(args.subscription.file, nextFile);
  assert.equal(args.subscription.sessionId, "stable-thread");
});
test("a failed rotated upload retains the old subscription path for retry", async (t) => {
  const args = await fixture(t);
  const original = args.subscription.file;
  const nextFile = join(original, "..", "resumed.jsonl");
  await writeFile(
    nextFile,
    JSON.stringify({ id: "rename", role: "user", content: "Name this Newron" }),
  );
  args.resolveTranscript = async () => ({
    file: nextFile,
    sessionId: "stable-thread",
  });
  args.request = async () =>
    Response.json({ error: "Unavailable" }, { status: 503 });
  await assert.rejects(syncTranscript(args), { status: 503 });
  assert.equal(args.subscription.file, original);
});

test("a long import holds intermediate batches and reports completion only at its final snapshot", async (t) => {
  const args = await fixture(t, 21);
  await appendFile(
    args.subscription.file,
    "\n" +
      JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
  );
  const batches = [];
  args.request = async (_url, opts) => {
    batches.push(JSON.parse(opts.body));
    return ok();
  };
  await syncTranscript(args);
  assert.deepEqual(
    batches.map((b) => b.syncComplete),
    [false, false, true],
  );
  assert.equal(batches.at(-1).responseState, "complete");
  assert.match(batches.at(-1).activityId, /^[a-f0-9]{64}$/);
});
