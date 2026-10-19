import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, utimes } from "node:fs/promises";
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
