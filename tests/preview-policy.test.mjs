import test from "node:test";
import assert from "node:assert/strict";
import { needsPreview, PREVIEW_VERSION } from "../lib/preview-policy.mjs";
test("legacy title-only previews are retried once with the new parser", () => {
  const item = {
    url: "https://example.com",
    previewStatus: "ready",
    imageUrl: null,
  };
  assert.equal(needsPreview(item), true);
  assert.equal(
    needsPreview({ ...item, previewVersion: PREVIEW_VERSION }),
    false,
  );
});
test("ready images and uploads are not repeatedly fetched", () => {
  assert.equal(
    needsPreview({
      url: "https://example.com",
      previewStatus: "ready",
      imageUrl: "https://example.com/cover.png",
    }),
    false,
  );
  assert.equal(
    needsPreview({
      url: "https://example.com",
      fileKey: "local",
      previewStatus: "pending",
    }),
    false,
  );
});
