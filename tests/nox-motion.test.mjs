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

import { strokeCenter } from "../lib/nox-motion.mjs";
import * as THREE from "three";
test("the neuron’s stroke weight stays centered at rest and throughout pointer rotation", () => {
  const corners = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ].map((v) => new THREE.Vector3(...v).normalize());
  for (const spin of [0, 1, 2, 3])
    for (const x of [-0.26, 0, 0.26])
      for (const y of [-0.26, 0, 0.26]) {
        const points = corners.map((p) =>
          p
            .clone()
            .applyEuler(new THREE.Euler(1.02, 2.86 + spin, -0.4))
            .applyEuler(new THREE.Euler(y, x, 0)),
        );
        const offset = strokeCenter(points);
        const result = strokeCenter(
          points.map((p) => ({ x: p.x - offset.x, y: p.y - offset.y })),
        );
        assert.ok(Math.abs(result.x) < 1e-10 && Math.abs(result.y) < 1e-10);
      }
});

test("optical centering follows stroke weight, not the bounding rectangle", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 6 },
    { x: 8, y: 0 },
  ];
  // Three strokes of lengths 6, 8 and 10; the ink centroid is (3, 2).
  assert.deepEqual(strokeCenter(points), { x: 3, y: 2 });
});
test("a collapsed projection has a finite center", () => {
  assert.deepEqual(
    strokeCenter([
      { x: 2, y: 3 },
      { x: 2, y: 3 },
    ]),
    { x: 2, y: 3 },
  );
});

import { readFile } from "node:fs/promises";
test("static marks use the same optical offset as the resting renderer", async () => {
  const points = [
    [24.14, 17.25],
    [27.25, 62.28],
    [43.76, 44.18],
    [64.84, 36.28],
  ].map(([x, y]) => ({ x, y }));
  const center = strokeCenter(points);
  for (const file of ["nox.svg", "favicon.svg"]) {
    const svg = await readFile(
      new URL(`../public/${file}`, import.meta.url),
      "utf8",
    );
    const [, x, y] = svg.match(/translate\(([-.\d]+) ([-.\d]+)\)/);
    assert.ok(Math.abs(center.x + Number(x) - 40) < 0.01);
    assert.ok(Math.abs(center.y + Number(y) - 40) < 0.01);
  }
});
