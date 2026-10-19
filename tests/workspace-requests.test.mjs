import test from "node:test";
import assert from "node:assert/strict";
import { workspaceRequests } from "../lib/workspace-requests.mjs";

test("an older poll cannot overwrite the response after creating a collection", () => {
  const requests = workspaceRequests();
  const old = requests.read();
  const finish = requests.mutate();
  finish();
  const fresh = requests.read();
  assert.equal(requests.current(fresh), true);
  assert.equal(requests.current(old), false);
});
test("reads during overlapping writes cannot undo deletions or restores", () => {
  const requests = workspaceRequests();
  const first = requests.mutate();
  const second = requests.mutate();
  assert.equal(requests.read(), null);
  first();
  assert.equal(requests.read(), null);
  second();
  const read = requests.read();
  assert.equal(requests.current(read), true);
  requests.invalidate();
  assert.equal(requests.current(read), false);
});
test("slow reads are not starved by polling, but mutations supersede them", () => {
  const requests = workspaceRequests();
  const a = requests.read();
  assert.equal(requests.read(), null);
  assert.equal(requests.current(a), true);
  requests.mutate()();
  const b = requests.read();
  requests.complete(a);
  assert.equal(requests.read(), null);
  assert.equal(requests.current(a), false);
  assert.equal(requests.current(b), true);
  requests.complete(b);
  assert.notEqual(requests.read(), null);
});
