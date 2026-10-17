import test from "node:test";
import assert from "node:assert/strict";
import { buddyBounds } from "../desktop/drag.mjs";
import { connectSession } from "../desktop/connect.mjs";
test("expanding near an edge keeps the buddy anchor fixed", () => {
  const anchor = { x: 900, y: 740 },
    area = { x: 0, y: 0, width: 1024, height: 800 },
    layout = buddyBounds(anchor, area, true);
  assert.equal(layout.bounds.x, anchor.x);
  assert.equal(layout.bounds.y + layout.offsetY, anchor.y);
  assert.equal(layout.bounds.height, 166);
});
test("explicit connection reports success only after capture", async () => {
  const events = [];
  const r = await connectSession({
    point: { x: 1, y: 2 },
    inspect: async () => ({ bundleId: "com.openai.codex" }),
    resolve: async () => ({ title: "Session" }),
    subscribe: async () => events.push("subscribe"),
    capture: async () => events.push("capture"),
    report: (v) => events.push(v.state),
  });
  assert.deepEqual(events, [
    "connecting",
    "subscribe",
    "collecting",
    "capture",
    "following",
  ]);
  assert.equal(r.connected, true);
});
test("failed capture never reports Connected", async () => {
  const states = [];
  const r = await connectSession({
    inspect: async () => ({ bundleId: "com.openai.codex" }),
    resolve: async () => ({ title: "Session" }),
    subscribe: async () => ({}),
    capture: async () => {
      throw new Error("Offline");
    },
    report: (v) => states.push(v.state),
  });
  assert.equal(r.connected, false);
  assert.equal(states.includes("following"), false);
});
test("unsupported target cannot connect", async () => {
  let called = false;
  await connectSession({
    inspect: async () => ({ bundleId: "com.apple.Safari" }),
    subscribe: async () => {
      called = true;
    },
    report: () => {},
  });
  assert.equal(called, false);
});
