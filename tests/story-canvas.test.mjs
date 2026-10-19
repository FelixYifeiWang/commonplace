import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasVariant,
  orderItems,
  pageUrl,
  pictureFor,
} from "../lib/story-canvas.mjs";

test("the variant follows the layout and how many pictures it holds", () => {
  assert.equal(canvasVariant("choice", 2), "duo");
  assert.equal(canvasVariant("choice", 3), "hero");
  assert.equal(canvasVariant("choice", 4), "grid");
  assert.equal(canvasVariant("reference", 1), "full");
  assert.equal(canvasVariant("reference", 2), "duo");
  assert.equal(canvasVariant("reference", 3), "set");
  assert.equal(canvasVariant("reference", 4), "grid");
  assert.equal(canvasVariant("before-after", 2), "pair");
  assert.equal(canvasVariant("detour", 3), "path");
  assert.equal(canvasVariant("none", 0), null);
});

test("a choice whose pictures are missing falls back to a reference, never an empty slot", () => {
  assert.equal(canvasVariant("choice", 1), "full");
  assert.equal(canvasVariant("before-after", 1), "full");
  assert.equal(canvasVariant("detour", 0), null);
});

test("the picked option leads, and a detour reads start, attempts, result", () => {
  assert.deepEqual(
    orderItems([
      { role: "option", itemId: "a" },
      { role: "picked", itemId: "b" },
    ]).map((i) => i.itemId),
    ["b", "a"],
  );
  assert.deepEqual(
    orderItems([
      { role: "result", itemId: "r" },
      { role: "attempt", itemId: "t" },
      { role: "start", itemId: "s" },
    ]).map((i) => i.itemId),
    ["s", "t", "r"],
  );
});

const item = (over) => ({
  id: "0b7e4c1e-1111-4222-8333-444455556666",
  kind: "link",
  url: "https://example.com/",
  imageUrl: null,
  fileKey: null,
  sourceRole: "assistant",
  ...over,
});

test("a website is a page, cropped from the top", () => {
  assert.deepEqual(pictureFor(item({}), { screenshots: true }), {
    src: "/api/screenshots/0b7e4c1e-1111-4222-8333-444455556666?v=3",
    fit: "page",
  });
  assert.equal(
    pictureFor(item({ imageUrl: "https://example.com/og.png" })).fit,
    "page",
  );
});

test("an uploaded picture is shown whole, and one the human added blends into the sheet", () => {
  const upload = item({ kind: "image", url: null, fileKey: "k" });
  assert.deepEqual(pictureFor(upload), {
    src: "/api/files/0b7e4c1e-1111-4222-8333-444455556666",
    fit: "object",
  });
  assert.equal(pictureFor({ ...upload, sourceRole: "user" }).fit, "ink");
});

test("an item with no picture becomes a text tile, not a grey box", () => {
  assert.equal(pictureFor(item({}), { screenshots: false }), null);
  assert.equal(pictureFor(item({ kind: "note", url: null })), null);
});

test("an artifact's picture opens the artifact, as any link opens its page", () => {
  const artifact = item({
    kind: "link",
    url: "https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4",
    fileKey: "k",
  });
  assert.equal(pageUrl(artifact), artifact.url);
  assert.equal(pageUrl(item({ kind: "image", url: null, fileKey: "k" })), null);
  assert.equal(
    pageUrl(item({ kind: "link", url: "javascript:alert(1)" })),
    null,
  );
});
