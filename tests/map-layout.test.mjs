import test from "node:test";
import assert from "node:assert/strict";
import { mapLayout, overlaps, zoomAround } from "../lib/map-layout.mjs";
test("zoom keeps the point beneath the pointer fixed, including zoom bounds", () => {
  const v = { x: 120, y: 80, zoom: 0.7 },
    p = { x: 430, y: 220 };
  for (const factor of [0.1, 0.9, 1.2, 10]) {
    const n = zoomAround(v, p, factor);
    assert.ok(Math.abs((p.x - v.x) / v.zoom - (p.x - n.x) / n.zoom) < 1e-8);
  }
});
test("all supported maps have non-overlapping tiles, summaries and revealed details", () => {
  for (let n = 1; n <= 6; n++)
    for (const details of [false, true]) {
      const boxes = mapLayout(
        Array.from({ length: n }, (_, i) => ({
          weight: i < 2 ? "major" : "normal",
          details: [{}, {}, {}],
        })),
        { details },
      );
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++)
          assert.equal(
            overlaps(boxes[i], boxes[j]),
            false,
            `${n} nodes: ${boxes[i].id}, ${boxes[j].id}`,
          );
    }
});
test("crowded dragged groups are separated without moving the center", () => {
  const boxes = mapLayout(
    Array.from({ length: 6 }, () => ({
      weight: "major",
      details: [{}, {}, {}],
    })),
    { details: true, offsets: { 0: { x: 0, y: 330 }, 1: { x: -280, y: 165 } } },
  );
  assert.deepEqual([boxes[0].x, boxes[0].y], [0, 0]);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.equal(overlaps(boxes[i], boxes[j]), false);
});

test("revealing details never moves the main ideas", () => {
  const nodes = Array.from({ length: 6 }, () => ({
    weight: "major",
    details: [{}, {}, {}],
  }));
  const offsets = { 0: { x: 300, y: 600 } };
  const overview = mapLayout(nodes, { offsets });
  const expanded = mapLayout(nodes, { details: true, offsets });
  for (const box of overview) {
    const detail = expanded.find((candidate) => candidate.id === box.id);
    assert.deepEqual([detail.x, detail.y], [box.x, box.y]);
  }
});

test("pinching keeps the stationary finger on the same idea", async () => {
  const { pinchAround } = await import("../lib/map-layout.mjs");
  const v = { x: 30, y: 60, zoom: 0.8 },
    fixed = { x: 100, y: 200 };
  const next = pinchAround(v, { x: 180, y: 200 }, { x: 220, y: 200 }, fixed);
  assert.ok(
    Math.abs((fixed.x - v.x) / v.zoom - (fixed.x - next.x) / next.zoom) < 1e-8,
  );
  assert.ok(
    Math.abs((fixed.y - v.y) / v.zoom - (fixed.y - next.y) / next.zoom) < 1e-8,
  );
});
