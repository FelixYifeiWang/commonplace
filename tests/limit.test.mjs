import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../lib/limit.mjs";
test("only the allowed number of tasks start at once", () => {
  const limit = createLimiter(2),
    started = [];
  for (const name of ["a", "b", "c"]) limit.acquire(() => started.push(name));
  assert.deepEqual(started, ["a", "b"]);
});
test("finishing a task starts the next one in order", () => {
  const limit = createLimiter(1),
    started = [];
  const stopA = limit.acquire(() => started.push("a"));
  limit.acquire(() => started.push("b"));
  limit.acquire(() => started.push("c"));
  stopA();
  assert.deepEqual(started, ["a", "b"]);
});
test("a request dropped while waiting never starts or takes a slot", () => {
  const limit = createLimiter(1),
    started = [];
  const stopA = limit.acquire(() => started.push("a"));
  const stopB = limit.acquire(() => started.push("b"));
  limit.acquire(() => started.push("c"));
  stopB();
  stopA();
  assert.deepEqual(started, ["a", "c"]);
});
test("stopping a task twice frees only one slot", () => {
  const limit = createLimiter(1),
    started = [];
  const stopA = limit.acquire(() => started.push("a"));
  limit.acquire(() => started.push("b"));
  limit.acquire(() => started.push("c"));
  stopA();
  stopA();
  assert.deepEqual(started, ["a", "b"]);
});
