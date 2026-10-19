import test from "node:test";
import assert from "node:assert/strict";
import { pictureFor } from "../lib/story-canvas.mjs";
import { createScreenshotCache } from "../lib/hosted/screenshot-cache.mjs";
const item = {
  id: "0b7e4c1e-1111-4222-8333-444455556666",
  kind: "link",
  imageUrl: "https://example.com/cover.png",
  url: "https://example.com/",
  updatedAt: "1",
};
test("visual recovery tries the cover, then screenshot, then text without looping", () => {
  const cover = pictureFor(item);
  assert.match(cover.src, /api\/images/);
  const shot = pictureFor(item, { failedSources: [cover.src] });
  assert.match(shot.src, /api\/screenshots/);
  assert.equal(
    pictureFor(item, { failedSources: [cover.src, shot.src] }),
    null,
  );
});
test("a missing cover can still have a screenshot and an updated cover can recover", () => {
  assert.match(pictureFor({ ...item, imageUrl: null }).src, /api\/screenshots/);
  assert.match(
    pictureFor(
      { ...item, updatedAt: "2" },
      { failedSources: [pictureFor(item).src] },
    ).src,
    /api\/images/,
  );
  assert.equal(
    pictureFor(
      { ...item, kind: "image" },
      { failedSources: [pictureFor(item).src] },
    ),
    null,
  );
});
test("concurrent captures share one job and saved screenshots are reused", async () => {
  let captures = 0;
  const saved = new Map();
  const get = createScreenshotCache({
    read: async (k) => saved.get(k),
    write: async (k, b) => saved.set(k, b),
    capture: async () => {
      captures++;
      await new Promise((r) => setTimeout(r, 5));
      return Buffer.from("jpeg");
    },
  });
  const results = await Promise.all([get(item.url), get(item.url)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(captures, 1);
  await get(item.url);
  assert.equal(captures, 1);
});
test("failed captures are throttled briefly, never saved as blank images", async () => {
  let captures = 0,
    writes = 0,
    now = 0;
  const get = createScreenshotCache({
    now: () => now,
    read: async () => null,
    write: async () => {
      writes++;
    },
    capture: async () => {
      captures++;
      throw Error("blank");
    },
  });
  await assert.rejects(get(item.url));
  await assert.rejects(get(item.url));
  assert.equal(captures, 1);
  assert.equal(writes, 0);
  now = 60001;
  await assert.rejects(get(item.url));
  assert.equal(captures, 2);
});

import vm from "node:vm";
import { pageReadiness } from "../lib/hosted/screenshot-readiness.mjs";
function readyPage({
  title = "A public design",
  text = "A useful description. ".repeat(12),
  busy = false,
  pending = false,
  fonts = "loaded",
} = {}) {
  const image = {
    complete: !pending,
    naturalWidth: 600,
    naturalHeight: 400,
    width: 600,
    height: 400,
    getBoundingClientRect: () => ({
      width: 600,
      height: 400,
      top: 0,
      bottom: 400,
    }),
  };
  return vm.runInNewContext(`(${pageReadiness.toString()})()`, {
    document: {
      title,
      readyState: "complete",
      fonts: { status: fonts },
      images: [image],
      body: { innerText: text, scrollHeight: 960 },
      querySelectorAll: () => (busy ? [image] : []),
    },
    innerHeight: 960,
    getComputedStyle: () => ({ visibility: "visible", opacity: "1" }),
  });
}
test("capture waits for images, fonts and loading indicators", () => {
  assert.equal(readyPage().ready, true);
  for (const options of [
    { pending: true },
    { fonts: "loading" },
    { busy: true },
  ])
    assert.equal(readyPage(options).ready, false);
});
test("sign-in and verification screens never become visual previews", () => {
  for (const options of [
    { title: "Sign in to your account" },
    { title: "Just a moment" },
    { text: "Log in to continue" },
  ])
    assert.equal(readyPage(options).blocked, true);
});
