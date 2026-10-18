import test from "node:test";
import assert from "node:assert/strict";
import { guidedBounds, guidedCamera } from "../lib/guided-map.mjs";

test("focus bounds include the node, summary and every evidence box", () => {
  const bounds = guidedBounds([
    { x: 0, y: 0, w: 200, h: 150, cy: 50 },
    { x: 250, y: 10, w: 200, h: 80, cy: 40 },
    { x: 500, y: 200, w: 150, h: 240, cy: 50 },
    { x: -1000, y: 0, w: 0, h: 0, cy: 0 },
  ]);
  assert.deepEqual(bounds, { x: -124, y: -74, width: 723, height: 488 });
});
test("bounds account for free-mode offsets and empty maps", () => {
  assert.deepEqual(
    guidedBounds([{ x: 0, y: 0, w: 100, h: 100, cy: 50, ox: 80, oy: 20 }]),
    { x: 6, y: -54, width: 148, height: 148 },
  );
  assert.ok(Object.values(guidedBounds([])).every(Number.isFinite));
});

test("camera fits every edge with space reserved for controls", () => {
  const bounds = { x: -530, y: -340, width: 1060, height: 680 };
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 640 },
  ]) {
    const c = guidedCamera(bounds, viewport);
    assert.ok(c.scale <= 1);
    assert.ok(bounds.x * c.scale + c.x >= 20 - 0.01);
    assert.ok(bounds.y * c.scale + c.y >= 20 - 0.01);
    assert.ok(
      (bounds.x + bounds.width) * c.scale + c.x <= viewport.width - 20 + 0.01,
    );
    assert.ok(
      (bounds.y + bounds.height) * c.scale + c.y <= viewport.height - 84 + 0.01,
    );
  }
});

test("focus scale is fixed at actual size when the viewport has room", () => {
  for (const x of [-400, 0, 400]) {
    const c = guidedCamera(
      { x, y: 100, width: 560, height: 420 },
      { width: 1200, height: 800 },
    );
    assert.equal(c.scale, 1);
    assert.equal(c.x + (x + 280) * c.scale, 600);
  }
});

test("zero-size initial viewport produces a finite camera", () => {
  const c = guidedCamera(
    { x: 0, y: 0, width: 0, height: 0 },
    { width: 0, height: 0 },
  );
  assert.ok(Object.values(c).every(Number.isFinite));
});
