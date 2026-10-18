import test from "node:test";
import assert from "node:assert/strict";
import { createDragController, buddyBounds } from "../desktop/drag.mjs";
function fixture(bounds, point) {
  let tick;
  const window = {
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => {
      bounds = { ...bounds, x, y };
    },
    setBounds: (b) => {
      bounds = { ...b };
    },
  };
  const drag = createDragController({
    window,
    cursor: () => point,
    every: (f) => ((tick = f), 1),
    stop: () => {},
  });
  return {
    drag,
    window,
    move: (p) => {
      point = p;
      tick?.();
    },
  };
}
for (const offset of [
  { x: 17, y: 71 },
  { x: 84, y: 139 },
  { x: 52, y: 108 },
]) {
  test(`drag keeps grab offset ${offset.x},${offset.y} through release and another drag`, async () => {
    const f = fixture(
      { x: 400, y: 250, width: 104, height: 166 },
      { x: 400 + offset.x, y: 250 + offset.y },
    );
    f.drag.start({ offset });
    f.move({ x: 710, y: 520 });
    await f.drag.end();
    assert.deepEqual(f.window.getBounds(), {
      x: 710 - offset.x,
      y: 520 - offset.y,
      width: 104,
      height: 166,
    });
    f.drag.start({ offset });
    f.move({ x: 810, y: 620 });
    await f.drag.end();
    assert.equal(f.window.getBounds().x, 810 - offset.x);
    assert.equal(f.window.getBounds().y, 620 - offset.y);
  });
}
test("native coordinates preserve an off-center grab across negative display origins and IPC delay", async () => {
  const f = fixture(
    { x: -1500, y: -200, width: 104, height: 166 },
    { x: -1200, y: 100 },
  );
  f.drag.start({ offset: { x: 20, y: 90 } });
  await f.drag.end();
  assert.equal(f.window.getBounds().x, -1220);
  assert.equal(f.window.getBounds().y, 10);
});
test("Connect visibility never changes the window or character anchor", () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  for (const y of [70, 300, 780]) {
    const anchor = { x: 700, y };
    assert.deepEqual(
      buddyBounds(anchor, area, false),
      buddyBounds(anchor, area, true),
    );
  }
});

test("capture interruption keeps the latest position; only Escape restores it", () => {
  const f = fixture(
    { x: 400, y: 250, width: 104, height: 166 },
    { x: 420, y: 340 },
  );
  f.drag.start({ offset: { x: 20, y: 90 } });
  f.move({ x: 710, y: 520 });
  f.drag.cancel();
  assert.deepEqual(f.window.getBounds(), {
    x: 690,
    y: 430,
    width: 104,
    height: 166,
  });
  f.drag.start({ offset: { x: 20, y: 90 } });
  f.move({ x: 810, y: 620 });
  f.drag.cancel({ restore: true });
  assert.equal(f.window.getBounds().x, 690);
});

import { handleBuddyMouse } from "../desktop/drag.mjs";
function nativeFixture() {
  let bounds = { x: 400, y: 250, width: 104, height: 166 };
  const results = [];
  const window = {
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => {
      bounds = { ...bounds, x, y };
    },
  };
  const drag = createDragController({
    window,
    polling: false,
    cursor: () => ({ x: 9999, y: 9999 }),
    every: () => {
      throw new Error("Native drag must not poll");
    },
  });
  const send = (type, x, y, modifiers = ["leftButtonDown"]) =>
    handleBuddyMouse(
      drag,
      {
        type,
        button: "left",
        x: x - bounds.x,
        y: y - bounds.y,
        globalX: x,
        globalY: y,
        modifiers,
      },
      bounds,
      (r) => results.push(r),
    );
  return { window, drag, send, results };
}
test("native release commits the event position synchronously and later hover cannot move it", () => {
  const f = nativeFixture();
  f.send("mouseDown", 420, 340);
  f.send("mouseMove", 720, 540);
  f.send("mouseUp", 750, 560, []);
  assert.deepEqual(f.window.getBounds(), {
    x: 730,
    y: 470,
    width: 104,
    height: 166,
  });
  f.send("mouseMove", 900, 800, []);
  f.drag.cancel();
  assert.equal(f.window.getBounds().x, 730);
  assert.deepEqual(f.results, [{ click: false, moved: true }]);
});
test("native fast release and immediate second drag keep independent grab offsets", () => {
  const f = nativeFixture();
  f.send("mouseDown", 420, 340);
  f.send("mouseUp", 700, 500, []);
  f.send("mouseDown", 760, 530);
  f.send("mouseUp", 800, 600, []);
  assert.deepEqual(f.window.getBounds(), {
    x: 720,
    y: 480,
    width: 104,
    height: 166,
  });
});
test("missing mouse-up freezes at last drag position instead of following hover or bouncing", () => {
  const f = nativeFixture();
  f.send("mouseDown", 420, 340);
  f.send("mouseMove", 720, 540);
  f.send("mouseMove", 900, 800, []);
  assert.equal(f.window.getBounds().x, 700);
  assert.equal(f.drag.isDragging(), false);
  assert.equal(f.results[0].click, false);
});
test("click toggles once while the Connect area never starts a drag", () => {
  const f = nativeFixture();
  f.send("mouseDown", 420, 340);
  f.send("mouseUp", 420, 340, []);
  f.send("mouseUp", 420, 340, []);
  f.send("mouseDown", 420, 270);
  f.send("mouseMove", 800, 800);
  assert.deepEqual(f.results, [{ click: true }]);
  assert.equal(f.window.getBounds().x, 400);
});

import { createHoverController, buddyHoverRegion } from "../desktop/drag.mjs";
test("hover opens controls, keeps the bridge active, and waits before closing", () => {
  let now = 0;
  const changes = [];
  const hover = createHoverController({
    now: () => now,
    onChange: (open) => changes.push(open),
  });
  hover.update(true);
  assert.deepEqual(changes, [true]);
  assert.equal(buddyHoverRegion({ x: 52, y: 52 }, true), true);
  hover.update(false);
  now = 200;
  hover.update(true);
  assert.deepEqual(changes, [true]);
  hover.update(false);
  now = 500;
  hover.update(false);
  assert.deepEqual(changes, [true, false]);
});
test("drag suppresses hover until pointer leaves; it never opens controls on release", () => {
  const changes = [];
  const hover = createHoverController({
    onChange: (open) => changes.push(open),
  });
  hover.update(true);
  hover.reset();
  hover.update(true);
  assert.deepEqual(changes, [true, false]);
  hover.update(false);
  hover.update(true);
  assert.deepEqual(changes, [true, false, true]);
});
test("collapsed hover ignores empty control space and accepts the face", () => {
  assert.equal(buddyHoverRegion({ x: 52, y: 20 }, false), false);
  assert.equal(buddyHoverRegion({ x: 52, y: 100 }, false), true);
  assert.equal(buddyHoverRegion({ x: 105, y: 100 }, true), false);
});
test("the closer Connect button never becomes a drag handle", () => {
  const f = nativeFixture();
  f.send("mouseDown", 452, 312);
  f.send("mouseMove", 700, 500);
  f.send("mouseUp", 700, 500, []);
  assert.deepEqual(f.results, []);
  assert.equal(f.window.getBounds().x, 400);
});
test("keyboard activation stays open until the pointer enters or controls are dismissed", () => {
  let now = 0;
  const changes = [];
  const hover = createHoverController({
    now: () => now,
    onChange: (value) => changes.push(value),
  });
  hover.show();
  hover.update(false);
  now = 500;
  hover.update(false);
  assert.deepEqual(changes, [true]);
  hover.update(true);
  hover.update(false);
  now = 1000;
  hover.update(false);
  assert.deepEqual(changes, [true, false]);
});
