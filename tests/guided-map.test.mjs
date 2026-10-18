import test from "node:test";
import assert from "node:assert/strict";
import { guidedPositions, guidedCamera } from "../lib/guided-map.mjs";

test("overview positions are stable and keep cards apart for one to six nodes", () => {
  for (let count = 1; count <= 6; count++) {
    const positions = guidedPositions(count);
    assert.deepEqual(positions, guidedPositions(count));
    for (const p of positions) {
      assert.ok(Math.abs(p.x) >= 180 || Math.abs(p.y) >= 160);
      for (const q of positions) {
        if (p === q) continue;
        assert.ok(Math.abs(p.x - q.x) >= 210 || Math.abs(p.y - q.y) >= 190);
      }
    }
  }
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
