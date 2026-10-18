import test from "node:test";
import assert from "node:assert/strict";
import {
  placeMap,
  radialPath,
  zoomLevel,
  visibleSessionMap,
} from "../lib/session-map.mjs";

// Rendered sizes, as the component measures them: tiles by weight, bubbles, details.
function widgets(n, { bubbles = true, details = 2 } = {}) {
  const W = { core: { w: 112, h: 150, cy: 56, fixed: true } };
  const tiles = [196, 196, 128, 128, 128, 92];
  for (let i = 0; i < n; i++) {
    W["m" + i] = {
      w: tiles[i] * 1.3,
      h: tiles[i],
      cy: tiles[i] / 2,
      node: i,
      fixed: true,
    };
    W["b" + i] = bubbles
      ? { w: 200, h: 84, cy: 42, node: i, fixed: true, bubble: true }
      : { w: 0, h: 0, cy: 0, node: i, fixed: true };
    for (let j = 0; j < details; j++)
      W[`d${i}.${j}`] = { w: 150, h: 46, cy: 23, node: i, det: true };
  }
  return W;
}
const box = (w) => ({
  l: w.x - w.w / 2,
  r: w.x + w.w / 2,
  t: w.y - w.cy,
  b: w.y - w.cy + w.h,
});
function overlaps(W) {
  const all = Object.entries(W).filter(([, w]) => w.w);
  const hits = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = box(all[i][1]),
        b = box(all[j][1]);
      if (
        Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 &&
        Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1
      )
        hits.push(`${all[i][0]} × ${all[j][0]}`);
    }
  return hits;
}

test("tiles sit at even angles around the center", () => {
  for (const n of [3, 4, 5, 6]) {
    const W = placeMap(widgets(n), n);
    const start = n === 6 ? -60 : -90;
    for (let i = 0; i < n; i++) {
      const m = W["m" + i];
      const angle = (Math.atan2(m.y, m.x / 1.25) * 180) / Math.PI;
      const want = ((start + (360 / n) * i + 540) % 360) - 180;
      // Angles compare around the circle, so 180° and -180° are the same.
      assert.ok(
        Math.abs(((angle - want + 540) % 360) - 180) < 0.01,
        `${n} nodes, tile ${i}: ${angle} vs ${want}`,
      );
    }
  }
});

test("nothing overlaps once laid out, with one to six nodes", () => {
  for (const n of [1, 2, 3, 4, 5, 6])
    assert.deepEqual(overlaps(placeMap(widgets(n), n)), [], `${n} nodes`);
});

test("hidden bubbles take no space", () => {
  const W = placeMap(widgets(6, { bubbles: false }), 6);
  assert.deepEqual(overlaps(W), []);
  assert.equal(W.b0.w, 0);
});

test("each detail fans out beyond its own tile", () => {
  const W = placeMap(widgets(4), 4);
  for (let i = 0; i < 4; i++)
    for (const j of [0, 1]) {
      const d = W[`d${i}.${j}`],
        m = W["m" + i];
      assert.ok(
        Math.hypot(d.x, d.y) > Math.hypot(m.x, m.y),
        `detail ${i}.${j} is outside its tile`,
      );
    }
});

test("lines bend the same way into their target", () => {
  assert.match(
    radialPath({ x: 0, y: 0 }, { x: 100, y: 0 }),
    /^M0 0C40 0 70 20 100 0$/,
  );
});

test("zoom levels: overview, details, then the human's words", () => {
  assert.equal(zoomLevel(1), 0);
  assert.equal(zoomLevel(1.6), 1);
  assert.equal(zoomLevel(3), 2);
});

test("deleted media is removed from map links while named references remain", () => {
  const map = {
    center: {
      itemId: "deleted",
      label: "Project",
      url: "https://deleted.example",
    },
    nodes: [
      { itemId: "deleted", url: "https://deleted.example", details: [] },
      {
        itemId: "kept",
        details: [
          { itemId: "deleted", url: "https://deleted.example" },
          { itemId: null, label: "A principle" },
        ],
      },
      {
        itemId: null,
        label: "Named reference",
        url: "https://reference.example",
        details: [],
      },
    ],
  };
  const original = structuredClone(map);
  const visible = visibleSessionMap(map, [{ id: "kept" }]);
  assert.deepEqual(
    visible.nodes.map((n) => n.itemId),
    ["kept", null],
  );
  assert.deepEqual(visible.nodes[0].details, [
    { itemId: null, label: "A principle" },
  ]);
  assert.deepEqual(visible.center, {
    itemId: null,
    label: "Project",
    url: null,
  });
  assert.deepEqual(map, original);
  assert.deepEqual(
    visibleSessionMap(map, [{ id: "kept" }, { id: "deleted" }]),
    original,
    "Undo restores the original map",
  );
});
