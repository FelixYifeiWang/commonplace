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

test("a dragged group stays under the pointer and pushes what it touches", () => {
  const nodes = Array.from({ length: 6 }, () => ({ weight: "normal" }));
  const base = mapLayout(nodes);
  const target = base.find((b) => b.id === "node-1");
  const start = base.find((b) => b.id === "node-0");
  const offsets = { 0: { x: target.x - start.x, y: target.y - start.y } };
  const boxes = mapLayout(nodes, { offsets, pinned: 0 });
  const held = boxes.find((b) => b.id === "node-0");
  assert.deepEqual([held.x, held.y], [target.x, target.y]);
  assert.deepEqual([boxes[0].x, boxes[0].y], [0, 0]);
  for (const box of boxes)
    if (box !== held && box.id !== "center")
      assert.equal(overlaps(held, box), false, box.id);
});

test("dragging through a neighbor moves it continuously, without jumps", async () => {
  const nodes = Array.from({ length: 6 }, () => ({ weight: "normal" }));
  const base = mapLayout(nodes);
  const start = base.find((b) => b.id === "node-0");
  const target = base.find((b) => b.id === "node-1");
  const { dragOffsets } = await import("../lib/map-layout.mjs");
  let previous = null,
    offsets = {};
  // Go well past the neighbor's starting point, as a real drag would.
  for (let k = 0; k <= 90; k++) {
    const t = k / 60;
    offsets = dragOffsets(
      nodes,
      {
        ...offsets,
        0: { x: (target.x - start.x) * t, y: (target.y - start.y) * t },
      },
      0,
    );
    const neighbor = mapLayout(nodes, { offsets, pinned: 0 }).find(
      (b) => b.id === "node-1",
    );
    if (previous)
      assert.ok(
        Math.hypot(neighbor.x - previous.x, neighbor.y - previous.y) < 24,
        `step ${k}`,
      );
    previous = neighbor;
  }
});

test("edges meet tile centers, with captions on the far side", async () => {
  const { tileCenter, captionAbove } = await import("../lib/map-layout.mjs");
  const boxes = mapLayout(
    Array.from({ length: 3 }, () => ({ weight: "major" })),
  );
  const [center, top, lowerRight] = boxes;
  assert.deepEqual(tileCenter(center), { x: 0, y: 0 });
  assert.equal(captionAbove(top), true);
  assert.equal(captionAbove(lowerRight), false);
  // Major tiles are 190 tall in a 290 box: the caption takes the other 100.
  assert.equal(tileCenter(top).y, top.y + 50);
  assert.equal(tileCenter(lowerRight).y, lowerRight.y - 50);
});
