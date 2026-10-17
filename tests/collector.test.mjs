import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
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
