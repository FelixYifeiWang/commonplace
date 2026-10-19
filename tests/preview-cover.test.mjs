import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  optimizeCover,
  createCoverLoader,
} from "../lib/hosted/preview-cover.mjs";
test("large static covers become bounded previews without losing transparency", async () => {
  const body = await sharp({
    create: {
      width: 2400,
      height: 1260,
      channels: 4,
      background: { r: 70, g: 80, b: 90, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const result = await optimizeCover({ body, contentType: "image/png" });
  const meta = await sharp(result.body).metadata();
  assert.equal(result.contentType, "image/webp");
  assert.equal(meta.width, 1280);
  assert.equal(meta.hasAlpha, true);
  assert.ok(result.body.length < body.length);
});
test("animated and vector sources remain intact", async () => {
  for (const contentType of ["image/gif", "image/svg+xml"]) {
    const original = { body: Buffer.from("preserve original"), contentType };
    assert.equal(await optimizeCover(original), original);
  }
});
test("unrecognized image encodings still use the original preview", async () => {
  const original = {
    body: Buffer.from("unrecognized image"),
    contentType: "image/png",
  };
  assert.equal(await optimizeCover(original), original);
});
test("cover requests coalesce and reuse a bounded cache, but failures can recover", async () => {
  let calls = 0,
    now = 0;
  const load = createCoverLoader({
    now: () => now,
    fetcher: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 3));
      return { body: Buffer.from("preview"), contentType: "image/webp" };
    },
    optimize: async (x) => x,
  });
  await Promise.all([
    load("https://example.com/a"),
    load("https://example.com/a"),
  ]);
  await load("https://example.com/a");
  assert.equal(calls, 1);
  now = 3600001;
  await load("https://example.com/a");
  assert.equal(calls, 2);
  let failures = 0;
  const recover = createCoverLoader({
    fetcher: async () => {
      if (++failures === 1) throw Error("offline");
      return { body: Buffer.from("ok"), contentType: "image/png" };
    },
    optimize: async (x) => x,
  });
  await assert.rejects(recover("https://example.com/b"));
  assert.equal((await recover("https://example.com/b")).body.toString(), "ok");
});
