import test from "node:test";
import assert from "node:assert/strict";
import { readSetupTicket, saveSetupTicket } from "../lib/setup-progress.mjs";
test("setup progress survives closing the dialog, stays account scoped and expires", () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const ticket = {
    link: "https://newron.app/setup.md#" + "a".repeat(64),
    setupId: "b".repeat(64),
    expiresAt: 1000,
  };
  saveSetupTicket(storage, "alice:setup", ticket);
  assert.deepEqual(readSetupTicket(storage, "alice:setup", 999), ticket);
  assert.equal(readSetupTicket(storage, "bob:setup", 999), null);
  assert.equal(readSetupTicket(storage, "alice:setup", 1000), null);
  assert.equal(data.size, 0);
});
test("unavailable storage never prevents setup", () => {
  const storage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.equal(readSetupTicket(storage, "setup"), null);
  assert.doesNotThrow(() => saveSetupTicket(storage, "setup", {}));
});
