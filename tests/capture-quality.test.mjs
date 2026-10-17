import test from "node:test";
import assert from "node:assert/strict";
import { hasVisualContent } from "../desktop/capture-quality.mjs";
test("blank and tiny spinner frames are rejected", () => {
  const frame = Buffer.alloc(100 * 100 * 4, 255);
  assert.equal(hasVisualContent(frame, 100, 100), false);
  for (let i = 4900; i < 4920; i++) frame.fill(100, i * 4, i * 4 + 3);
  assert.equal(hasVisualContent(frame, 100, 100), false);
});
test("a frame containing meaningful visual content is accepted", () => {
  const frame = Buffer.alloc(100 * 100 * 4, 255);
  for (let i = 2000; i < 5000; i++) frame.fill(40, i * 4, i * 4 + 3);
  assert.equal(hasVisualContent(frame, 100, 100), true);
});
