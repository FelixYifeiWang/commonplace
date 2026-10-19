import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { installCaptureFrames } from "../lib/hosted/capture-frames.mjs";

function runtime() {
  let next = 0;
  const timers = new Map(),
    frames = new Map();
  const win = {
    requestAnimationFrame: (fn) => {
      frames.set(++next, fn);
      return next;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const context = vm.createContext({
    window: win,
    setTimeout: (fn, delay) => {
      assert.equal(delay, 500);
      timers.set(++next, fn);
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
    Map,
  });
  vm.runInContext(`(${installCaptureFrames.toString()})()`, context);
  const tick = () => {
    for (const [id, fn] of [...timers]) {
      timers.delete(id);
      fn();
    }
    for (const [id, fn] of [...frames]) {
      frames.delete(id);
      fn(1000);
    }
  };
  return { win, timers, frames, tick };
}

test("capture frames batch callbacks and defer new work to the next frame", () => {
  const { win, timers, tick } = runtime();
  assert.equal(win.devicePixelRatio, 0.25);
  const calls = [];
  win.requestAnimationFrame((time) => {
    calls.push(time);
    win.requestAnimationFrame(() => calls.push("next"));
  });
  win.requestAnimationFrame(() => calls.push("same"));
  assert.equal(timers.size, 1);
  tick();
  assert.deepEqual(calls, [1000, "same"]);
  tick();
  assert.deepEqual(calls, [1000, "same", "next"]);
});

test("cancel and pause prevent pending animation work during screenshot readback", () => {
  const { win, timers, frames, tick } = runtime();
  const id = win.requestAnimationFrame(() => assert.fail("canceled callback"));
  win.cancelAnimationFrame(id);
  tick();
  win.requestAnimationFrame(() => assert.fail("paused callback"));
  win.__newronPauseCaptureFrames();
  win.requestAnimationFrame(() => assert.fail("new work while paused"));
  tick();
  assert.equal(timers.size + frames.size, 0);
});
