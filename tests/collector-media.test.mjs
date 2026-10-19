import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncTranscript } from "../desktop/collector.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const ARTIFACT = "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "newron-media-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const html = join(dir, "story.html");
  await writeFile(html, "<title>Story</title><h1>Step 01</h1>");
  const file = join(dir, "session.jsonl");
  const lines = [
    {
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: PNG.toString("base64"),
            },
          },
          { type: "text", text: "make this a reference for the canvas" },
        ],
      },
    },
    {
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: `Mockup is at ${ARTIFACT}` },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "Artifact",
            input: { file_path: html },
          },
        ],
      },
    },
    {
      type: "user",
      uuid: "r1",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: `Published ${html} at ${ARTIFACT} (Version 1)`,
          },
        ],
      },
    },
  ];
  await writeFile(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const calls = [];
  let failMedia = 0;
  const captured = [];
  const args = {
    connection: { origin: "https://example.test", token: "test-only" },
    subscription: { id: "selected", file, mode: "follow" },
    cursors: {},
    request: async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ path: new URL(url).pathname, body });
      if (url.endsWith("/api/capture/media") && failMedia > 0) {
        failMedia--;
        return Response.json({ error: "Try again" }, { status: 503 });
      }
      return Response.json({ ok: true });
    },
    media: {
      captureArtifact: async (path) => {
        captured.push(path);
        return { data: PNG, mimeType: "image/png", title: "Story" };
      },
    },
  };
  return {
    args,
    html,
    calls,
    captured,
    media: () =>
      calls.filter((c) => c.path === "/api/capture/media").map((c) => c.body),
    failNext: (n) => (failMedia = n),
  };
}

test("pasted images and artifact captures are uploaded after the turns that mention them", async (t) => {
  const { args, calls, media } = await fixture(t);
  await syncTranscript(args);
  const firstMedia = calls.findIndex((c) => c.path === "/api/capture/media");
  assert.ok(firstMedia > calls.findIndex((c) => c.path === "/api/capture"));
  const [pasted, artifact] = media();
  assert.deepEqual(
    { ...pasted, data: pasted.data.length > 0 },
    {
      subscriptionId: "selected",
      kind: "pasted",
      turnId: "u1",
      mimeType: "image/png",
      data: true,
      context: "make this a reference for the canvas",
    },
  );
  assert.equal(artifact.kind, "artifact");
  assert.equal(artifact.url, ARTIFACT);
  assert.equal(artifact.title, "Story");
  assert.equal(artifact.turnId, "a1");
});

test("each picture is sent once, and an artifact again only after its file changes", async (t) => {
  const { args, html, media, captured } = await fixture(t);
  await syncTranscript(args);
  await syncTranscript(args);
  assert.equal(media().length, 2);
  assert.equal(captured.length, 1);
  await writeFile(html, "<title>Story</title><h1>Step 01, revised</h1>");
  const later = new Date(Date.now() + 5000);
  await utimes(html, later, later);
  await syncTranscript(args);
  assert.deepEqual(
    media().map((m) => m.kind),
    ["pasted", "artifact", "artifact"],
  );
});

test("an artifact captured before Nox framed its work is captured again, once", async (t) => {
  const { args, html, captured } = await fixture(t);
  const info = await stat(html);
  args.cursors = {
    "media:selected": [`artifact:${ARTIFACT}:${info.size}:${info.mtimeMs}`],
  };
  await syncTranscript(args);
  await syncTranscript(args);
  assert.equal(captured.length, 1);
});

test("a failed picture upload never fails the turns, and is retried on the next sync", async (t) => {
  const { args, media, failNext } = await fixture(t);
  failNext(1);
  const result = await syncTranscript(args);
  assert.ok(result.captured > 0);
  await syncTranscript(args);
  assert.deepEqual(
    media().map((m) => m.kind),
    ["pasted", "artifact", "pasted"],
  );
});

test("an artifact whose file is gone is skipped without failing the sync", async (t) => {
  const { args, html, media } = await fixture(t);
  await rm(html);
  await syncTranscript(args);
  assert.deepEqual(
    media().map((m) => m.kind),
    ["pasted"],
  );
});

test("without a capture function, only pasted images are sent", async (t) => {
  const { args, media } = await fixture(t);
  delete args.media.captureArtifact;
  await syncTranscript(args);
  assert.deepEqual(
    media().map((m) => m.kind),
    ["pasted"],
  );
});

test("one-time import waits for artifact captures beyond the per-sync budget", async (t) => {
  const { args, html, calls, media } = await fixture(t);
  args.subscription.mode = "once";
  args.subscription.artifacts = Array.from({ length: 10 }, (_, i) => ({
    file: html,
    url: `https://claude.ai/artifact/fixture${i}`,
    turnId: "a1",
    context: "Preview",
  }));
  await syncTranscript(args);
  assert.equal(args.subscription.historyRemaining, true);
  assert.ok(!calls.some((c) => c.path === "/api/capture" && c.body.complete));
  await syncTranscript(args);
  assert.equal(args.subscription.historyRemaining, false);
  assert.equal(media().filter((m) => m.kind === "artifact").length, 11);
  assert.equal(calls.at(-1).body.complete, true);
});
test("one-time import retries a transient artifact capture failure", async (t) => {
  const { args, calls } = await fixture(t);
  args.subscription.mode = "once";
  const capture = args.media.captureArtifact;
  args.media.captureArtifact = async () => null;
  await syncTranscript(args);
  assert.equal(args.subscription.historyRemaining, true);
  assert.ok(!calls.some((c) => c.path === "/api/capture" && c.body.complete));
  args.media.captureArtifact = capture;
  await syncTranscript(args);
  assert.equal(args.subscription.historyRemaining, false);
  assert.equal(calls.at(-1).body.complete, true);
});

test("missing artifact files do not block a one-time import", async (t) => {
  const { args, html, calls } = await fixture(t);
  args.subscription.mode = "once";
  await rm(html);
  await syncTranscript(args);
  assert.equal(args.subscription.historyRemaining, false);
  assert.equal(calls.at(-1).body.complete, true);
});
test("one-time artifact upload retries preserve successful pasted pictures", async (t) => {
  const { args, calls, media } = await fixture(t);
  args.subscription.mode = "once";
  const request = args.request;
  let fail = true;
  args.request = async (url, options) => {
    if (
      url.endsWith("/api/capture/media") &&
      JSON.parse(options.body).kind === "artifact" &&
      fail
    )
      return Response.json({}, { status: 503 });
    return request(url, options);
  };
  await syncTranscript(args);
  assert.equal(args.subscription.historyRemaining, true);
  fail = false;
  await syncTranscript(args);
  assert.equal(media().filter((m) => m.kind === "pasted").length, 1);
  assert.equal(media().filter((m) => m.kind === "artifact").length, 1);
  assert.equal(calls.at(-1).body.complete, true);
});

test("lost final media acknowledgement settles on retry without uploading pictures again", async (t) => {
  const { args, calls } = await fixture(t);
  args.subscription.mode = "once";
  const request = args.request;
  let complete = false;
  args.request = async (url, opts) => {
    if (complete)
      return Response.json({ code: "IMPORT_COMPLETE" }, { status: 409 });
    if (JSON.parse(opts.body).complete) {
      complete = true;
      throw new Error("Lost final acknowledgement");
    }
    return request(url, opts);
  };
  await assert.rejects(syncTranscript(args), /Lost final acknowledgement/);
  const before = calls.filter((c) => c.path === "/api/capture/media").length;
  assert.ok(before > 0);
  const result = await syncTranscript(args);
  assert.equal(result.completed, true);
  assert.equal(
    calls.filter((c) => c.path === "/api/capture/media").length,
    before,
  );
});
