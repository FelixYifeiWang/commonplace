import test from "node:test";
import assert from "node:assert/strict";
import { pickRegion } from "../desktop/artifact-region.mjs";

const view = { width: 1280, height: 800 };
const page = (height = 3000) => ({ width: 1280, height });
const box = (kind, x, y, width, height) => ({ kind, x, y, width, height });
const inside = (outer, inner) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

test("a page with nothing visual keeps the top of the page", () => {
  assert.equal(pickRegion({ view, page: page(), boxes: [] }), null);
});

test("a page that fits one screen is one composition and stays whole", () => {
  const window_ = box("media", 496, 183, 293, 385);
  assert.equal(pickRegion({ view, page: page(800), boxes: [window_] }), null);
});

test("icons and thin rules are not a picture", () => {
  const boxes = [
    box("media", 40, 20, 32, 32),
    box("backdrop", 0, 400, 1280, 6),
  ];
  assert.equal(pickRegion({ view, page: page(), boxes }), null);
});

test("the picture below a title and intro is framed instead of the page top", () => {
  const image = box("media", 360, 900, 560, 380);
  const region = pickRegion({ view, page: page(), boxes: [image] });
  assert.ok(inside(region, image));
  assert.ok(region.y > 600, "skips the title and intro");
});

test("a before and after pair side by side is framed together", () => {
  const before = box("media", 80, 600, 520, 330);
  const after = box("media", 640, 600, 520, 330);
  const region = pickRegion({ view, page: page(), boxes: [before, after] });
  assert.ok(inside(region, before) && inside(region, after));
});

test("a section that spans the page is layout, not the picture", () => {
  const section = box("panel", 0, 0, 1280, 1400);
  const image = box("media", 400, 1500, 480, 320);
  const region = pickRegion({ view, page: page(), boxes: [section, image] });
  assert.ok(inside(region, image));
  assert.ok(region.height <= view.height);
});

test("a demo panel is the picture when the page has no images", () => {
  const legend = box("panel", 40, 120, 1200, 60);
  const demo = box("panel", 560, 520, 680, 420);
  const region = pickRegion({ view, page: page(), boxes: [legend, demo] });
  assert.ok(inside(region, demo));
});

test("an image wins over a framed text panel of the same size", () => {
  const panel = box("panel", 80, 300, 500, 340);
  const image = box("media", 700, 1100, 500, 340);
  const region = pickRegion({ view, page: page(), boxes: [panel, image] });
  assert.ok(inside(region, image));
});

test("of two equal pictures the earlier one is framed", () => {
  const first = box("media", 360, 700, 560, 380);
  const later = box("media", 360, 2200, 560, 380);
  const region = pickRegion({ view, page: page(), boxes: [later, first] });
  assert.ok(inside(region, first));
});

test("the frame stays on the page, within one screen, and close to a card's shape", () => {
  const tall = box("media", 1000, 2700, 240, 280);
  const region = pickRegion({ view, page: page(), boxes: [tall] });
  assert.ok(region.x >= 0 && region.y >= 0);
  assert.ok(region.x + region.width <= 1280);
  assert.ok(region.y + region.height <= 3000);
  assert.ok(region.width <= view.width && region.height <= view.height);
  const ratio = region.width / region.height;
  assert.ok(ratio >= 4 / 3 - 0.01 && ratio <= 16 / 9 + 0.01, `ratio ${ratio}`);
});

test("a picture larger than the screen is framed from its top", () => {
  const poster = box("media", 0, 200, 1280, 2400);
  const region = pickRegion({ view, page: page(), boxes: [poster] });
  assert.ok(Math.abs(region.y - 200) <= 24, `starts at ${region.y}`);
  assert.ok(region.height <= view.height);
});
