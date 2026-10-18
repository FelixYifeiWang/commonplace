import test from "node:test";
import assert from "node:assert/strict";
import { followGaze } from "../lib/nox-motion.mjs";
test("pointer easing takes the same time at 30, 60 and 120Hz", () => {
  const results = [30, 60, 120].map((hz) => {
    let value = 0;
    for (let i = 0; i < hz; i++) value = followGaze(value, 0.3, 1 / hz);
    return value;
  });
  assert.ok(Math.max(...results) - Math.min(...results) < 0.00001);
});
test("tracking reversals settle without overshoot", () => {
  let value = 0.3;
  for (let i = 0; i < 120; i++) {
    const next = followGaze(value, -0.3, 1 / 60);
    assert.ok(next >= -0.3 && next <= value);
    value = next;
  }
  assert.ok(Math.abs(value + 0.3) < 0.00001);
});

import { pointerDirection } from "../lib/nox-motion.mjs";
test("pointer direction preserves diagonals and has no hard rectangular clamp", () => {
  const far = pointerDirection(1200, 600);
  assert.equal(far.x / far.y, 2);
  assert.ok(Math.hypot(far.x, far.y) < 2);
  assert.ok(pointerDirection(800, 0).x > pointerDirection(400, 0).x);
  assert.deepEqual(pointerDirection(0, 0), { x: 0, y: 0 });
});
