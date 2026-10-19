import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaReader,
  parseMediaUpload,
  privatePage,
  artifactUrl,
  MAX_MEDIA_BYTES,
} from "../lib/session-media.mjs";
import { parseTranscript } from "../lib/protocol.mjs";
import { pictureFor } from "../lib/story-canvas.mjs";
import { imageSource } from "../lib/media-source.mjs";
import { sourceHost, curateGalleryItems } from "../lib/gallery.mjs";
import { previewUrl } from "../desktop/preview.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const png64 = PNG.toString("base64");
const read = (records) => {
  const reader = createMediaReader();
  return records.flatMap((r, i) => reader.read(JSON.stringify(r), i));
};

// ---------- reading pictures out of a transcript ----------
test("an image pasted in Claude Code becomes the human's own picture, with the words around it", () => {
  const [event] = read([
    {
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: png64 },
          },
          { type: "text", text: "make this a reference for the canvas" },
        ],
      },
    },
  ]);
  assert.deepEqual(event, {
    kind: "pasted",
    turnId: "u1",
    mimeType: "image/png",
    data: png64,
    context: "make this a reference for the canvas",
  });
});

test("the words saved with an image are the human's, not notes the agent app added", () => {
  const [event] = read([
    {
      type: "user",
      uuid: "u3",
      message: {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: png64 },
          },
          {
            type: "text",
            text: "<system-reminder>\nLinked sessions now: idle\n</system-reminder>\nwhen this session is fetched by newron, it shows broken images",
          },
        ],
      },
    },
  ]);
  assert.equal(
    event.context,
    "when this session is fetched by newron, it shows broken images",
  );
});

test("an image sent while the assistant was working is read too", () => {
  const events = read([
    {
      type: "attachment",
      uuid: "q1",
      attachment: {
        type: "queued_command",
        prompt: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: png64 },
          },
          { type: "text", text: "some node ends are not connected" },
        ],
      },
    },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].turnId, "q1");
  assert.equal(events[0].context, "some node ends are not connected");
});

test("a message sent while the assistant was working is part of the conversation", () => {
  const [turn] = parseTranscript(
    JSON.stringify({
      type: "attachment",
      uuid: "q2",
      attachment: {
        type: "queued_command",
        prompt: "remove the right menu next to story",
      },
    }),
  );
  assert.deepEqual(
    { id: turn.id, role: turn.role, text: turn.text },
    { id: "q2", role: "user", text: "remove the right menu next to story" },
  );
});

test("an image pasted in Codex keeps the turn ID the transcript parser gives it", () => {
  const record = {
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        { type: "input_image", image_url: `data:image/png;base64,${png64}` },
        { type: "input_text", text: "these are the style I'm looking for" },
      ],
    },
  };
  const reader = createMediaReader();
  const [event] = reader.read(JSON.stringify(record), 7);
  assert.equal(event.turnId, parseTranscript(JSON.stringify(record), 7)[0].id);
  assert.equal(event.mimeType, "image/png");
});

test("a published artifact is paired with the local file it was made from", () => {
  const events = read([
    {
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "Artifact",
            input: {
              file_path: "/tmp/mock/story.html",
              description: "Story mockup",
            },
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
            content:
              "Published /tmp/mock/story.html at https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4 (Version 3)",
          },
        ],
      },
    },
  ]);
  assert.deepEqual(events, [
    {
      kind: "artifact",
      turnId: "a1",
      url: "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4",
      file: "/tmp/mock/story.html",
      context: "Story mockup",
    },
  ]);
});

test("reads, asset uploads and failed publishes are not artifacts", () => {
  const use = (id, input) => ({
    type: "assistant",
    uuid: `a-${id}`,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Artifact", input }],
    },
  });
  const result = (id, content) => ({
    type: "user",
    uuid: `r-${id}`,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content }],
    },
  });
  const url = "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4";
  assert.deepEqual(
    read([
      use("t1", { action: "read", url }),
      result("t1", `Published x at ${url}`),
      use("t2", { file_path: "/tmp/a.png", url, asset: true }),
      result("t2", `Published /tmp/a.png at ${url}`),
      use("t3", { file_path: "/tmp/b.html" }),
      result("t3", "Error: the publish was refused"),
    ]),
    [],
  );
});

test("only real images are read, never other attachments", () => {
  assert.deepEqual(
    read([
      {
        type: "user",
        uuid: "u2",
        message: {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/svg+xml",
                data: "PHN2Zz4=",
              },
            },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: "JVBE",
              },
            },
          ],
        },
      },
    ]),
    [],
  );
});

// ---------- what the server accepts ----------
test("an upload is checked: a real image of a known type, within the size limit", () => {
  const ok = parseMediaUpload({
    kind: "pasted",
    turnId: "u1",
    mimeType: "image/png",
    data: png64,
    context: "x",
  });
  assert.equal(ok.kind, "pasted");
  assert.equal(ok.bytes.length, PNG.length);
  assert.throws(
    () =>
      parseMediaUpload({
        kind: "pasted",
        turnId: "u1",
        mimeType: "image/jpeg",
        data: png64,
      }),
    /image/,
  );
  assert.throws(
    () =>
      parseMediaUpload({
        kind: "pasted",
        turnId: "u1",
        mimeType: "text/html",
        data: png64,
      }),
    /image/,
  );
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_MEDIA_BYTES)]).toString(
    "base64",
  );
  assert.throws(
    () =>
      parseMediaUpload({
        kind: "pasted",
        turnId: "u1",
        mimeType: "image/png",
        data: big,
      }),
    /large/,
  );
});

test("a capture belongs to a claude.ai artifact link and nothing else", () => {
  const capture = (url) =>
    parseMediaUpload({
      kind: "artifact",
      turnId: "a1",
      mimeType: "image/png",
      data: png64,
      url,
      title: "Story",
    });
  assert.equal(
    capture("https://claude.ai/code/artifact/PkxxssFTMZtnyjsktQMNM4").url,
    "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4",
  );
  assert.throws(
    () => capture("https://example.com/artifact/PkxxssFTMZtnyjsktQMNM4"),
    /artifact/,
  );
  assert.equal(artifactUrl("https://claude.ai/artifact/../../etc"), null);
});

// ---------- what the views show ----------
const link = (over) => ({
  id: "6f9a3b0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  kind: "link",
  url: "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4",
  imageUrl: "https://claude.ai/images/claude_ogimage.png",
  fileKey: null,
  sourceRole: "assistant",
  updatedAt: "2026-10-19T00:00:00.000Z",
  ...over,
});

test("a claude.ai link never shows Claude's generic card or a sign-in page", () => {
  assert.equal(
    privatePage("https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4"),
    true,
  );
  assert.equal(privatePage("https://www.hirotos.com/"), false);
  assert.equal(imageSource(link({})), null);
  assert.equal(pictureFor(link({}), { screenshots: true }), null);
});

test("an artifact link shows its capture whole: Nox already framed the part that shows the work", () => {
  const captured = link({ fileKey: "users/me/abc/capture.jpg" });
  assert.deepEqual(pictureFor(captured, { screenshots: true }), {
    src: `/api/files/${captured.id}?v=${encodeURIComponent(captured.updatedAt)}`,
    fit: "work",
  });
  assert.equal(imageSource(captured), pictureFor(captured).src);
});

test("a captured link still reads as a link: its host shows and duplicates merge by address", () => {
  const captured = link({ fileKey: "users/me/abc/capture.jpg" });
  assert.equal(sourceHost(captured), "claude.ai");
  const twin = link({
    id: "7f9a3b0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    fileKey: null,
  });
  assert.equal(curateGalleryItems([twin, captured]).length, 1);
});

test("a preview never saves Claude's generic card as a page's picture", async () => {
  const page = `<html><head><title>Claude</title><meta property="og:image" content="https://claude.ai/images/claude_ogimage.png"></head></html>`;
  const preview = await previewUrl(
    "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4",
    {
      fetcher: async (url) => ({
        url,
        contentType: "text/html",
        body: page,
        status: 200,
      }),
    },
  );
  assert.equal(preview.imageUrl, null);
});
