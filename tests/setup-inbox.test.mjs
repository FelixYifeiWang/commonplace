import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  consumeSetupRequest,
  consumeShowRequest,
} from "../desktop/setup-inbox.mjs";
const id = "12345678-1234-1234-1234-123456789abc";
async function fixture(t) {
  const data = await mkdtemp(join(tmpdir(), "buddy-inbox-"));
  t.after(() => rm(data, { recursive: true, force: true }));
  await writeFile(
    join(data, "setup-request.json"),
    JSON.stringify({
      id,
      origin: "https://space.example",
      code: "a".repeat(64),
      action: "connect",
      source: { file: "/selected.jsonl", provider: "Cursor" },
    }),
  );
  return data;
}
test("setup acknowledges Connected only after pairing and first capture; removes the expiring code", async (t) => {
  const data = await fixture(t),
    events = [];
  const result = await consumeSetupRequest(data, {
    origin: "https://space.example",
    validate: async (source) => ({ ...source, sessionId: "s" }),
    request: async () => Response.json({ token: "b".repeat(64) }),
    pair: async () => events.push("pair"),
    subscribe: async () => {
      events.push("subscribe");
      return { id: "s" };
    },
    capture: async () => events.push("capture"),
    report: (s) => events.push(s.state),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(events, [
    "connecting",
    "pair",
    "subscribe",
    "collecting",
    "capture",
    "following",
  ]);
  await assert.rejects(readFile(join(data, "setup-request.json")), {
    code: "ENOENT",
  });
  assert.equal(
    JSON.parse(await readFile(join(data, "receipts", id + ".json"))).ok,
    true,
  );
});
test("failed capture reports failure, never a false connected receipt", async (t) => {
  const data = await fixture(t),
    states = [];
  const result = await consumeSetupRequest(data, {
    origin: "https://space.example",
    validate: async (s) => s,
    request: async () => Response.json({ token: "b".repeat(64) }),
    pair: async () => {},
    subscribe: async () => ({ id: "s" }),
    capture: async () => {
      throw new Error("Offline");
    },
    report: (s) => states.push(s.state),
  });
  assert.equal(result.ok, false);
  assert.equal(states.includes("following"), false);
});

test("setup pairs without reading or subscribing any session, even with a legacy source", async (t) => {
  const data = await fixture(t),
    events = [];
  const file = join(data, "setup-request.json");
  const input = JSON.parse(await readFile(file));
  delete input.action;
  await writeFile(file, JSON.stringify(input));
  const forbidden = () => {
    throw new Error("Setup must not access transcripts");
  };
  const result = await consumeSetupRequest(data, {
    origin: "https://space.example",
    request: async () => Response.json({ token: "b".repeat(64) }),
    pair: async () => events.push("pair"),
    validate: forbidden,
    subscribe: forbidden,
    capture: forbidden,
    report: (s) => events.push(s.state),
  });
  assert.deepEqual(result, { ok: true, action: "setup" });
  assert.deepEqual(events, ["pair"]);
});

test("reopen consumes one signal without touching a pending setup or session", async (t) => {
  const data = await fixture(t);
  const setup = await readFile(join(data, "setup-request.json"), "utf8");
  let shown = 0;
  assert.equal(await consumeShowRequest(data, () => shown++), false);
  await writeFile(join(data, "show-request"), "");
  assert.equal(await consumeShowRequest(data, () => shown++), true);
  assert.equal(await consumeShowRequest(data, () => shown++), false);
  assert.equal(shown, 1);
  assert.equal(await readFile(join(data, "setup-request.json"), "utf8"), setup);
});
