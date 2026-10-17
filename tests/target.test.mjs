import test from "node:test";
import assert from "node:assert/strict";
import { resolveTarget } from "../desktop/target.mjs";
const sessions = [
  {
    sessionId: "11111111-1111-4111-8111-111111111111",
    title: "Define AI idea collaboration space",
    file: "/safe/a.jsonl",
    provider: "Codex",
  },
  {
    sessionId: "22222222-2222-4222-8222-222222222222",
    title: "Review portfolio",
    file: "/safe/b.jsonl",
    provider: "Codex",
  },
];
const target = (text, extra = {}) => ({
  bundleId: "com.openai.codex",
  labels: [text],
  ...extra,
});
test("drop on an exact title resolves without a picker", () => {
  assert.equal(
    resolveTarget(target(sessions[0].title), sessions).sessionId,
    sessions[0].sessionId,
  );
});
test("a session URL resolves an otherwise ambiguous label", () => {
  assert.equal(
    resolveTarget(
      target("Conversation", {
        urls: ["codex://threads/" + sessions[1].sessionId],
      }),
      sessions,
    ).sessionId,
    sessions[1].sessionId,
  );
});
test("a duplicate title is rejected instead of guessing the newest session", () => {
  assert.throws(
    () =>
      resolveTarget(target(sessions[0].title), [
        ...sessions,
        { ...sessions[1], title: sessions[0].title },
      ]),
    /ambiguous/i,
  );
});
test("unrelated text does not match a session", () => {
  assert.throws(() => resolveTarget(target("Recents"), sessions), /title/i);
});
test("other applications cannot trigger a subscription using coincidentally matching text", () => {
  assert.throws(
    () =>
      resolveTarget(
        target(sessions[0].title, { bundleId: "com.apple.Safari" }),
        sessions,
      ),
    /Codex/i,
  );
});
test("truncated labels do not auto-connect a guessed session", () => {
  assert.throws(
    () => resolveTarget(target("Define AI idea collaborat…"), sessions),
    /title/i,
  );
});
test("conflicting identifiers fail closed", () => {
  assert.throws(
    () =>
      resolveTarget(
        target("Conversation", {
          urls: sessions.map((s) => "codex://threads/" + s.sessionId),
        }),
        sessions,
      ),
    /ambiguous/i,
  );
});
test("a targeted sidebar row takes precedence over the open window title", () => {
  assert.equal(
    resolveTarget(
      target(sessions[1].title, { windowLabels: [sessions[0].title] }),
      sessions,
    ).sessionId,
    sessions[1].sessionId,
  );
});
test("an unresolved row never falls back to a different open conversation", () => {
  assert.throws(
    () =>
      resolveTarget(
        target("Missing conversation", { windowLabels: [sessions[0].title] }),
        sessions,
      ),
    /title/i,
  );
});

import { createDragController } from "../desktop/drag.mjs";
import { confineTranscript } from "../desktop/target.mjs";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("a symlink cannot turn a session target into an arbitrary file read", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "commonplace-path-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "sessions"));
  await writeFile(join(dir, "private.jsonl"), "private");
  await symlink(
    join(dir, "private.jsonl"),
    join(dir, "sessions", "escape.jsonl"),
  );
  await assert.rejects(
    confineTranscript(join(dir, "sessions", "escape.jsonl"), dir),
    /outside/,
  );
});
function dragFixture() {
  let point = { x: 10, y: 10 };
  const events = [];
  let bounds = { x: 0, y: 0, width: 100, height: 100 };
  const window = {
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => {
      bounds = { ...bounds, x, y };
    },
    setBounds: (value) => {
      bounds = { ...value };
      events.push("restore");
    },
    hide: () => events.push("hide"),
    showInactive: () => events.push("show"),
  };
  return {
    events,
    move: () => {
      point = { x: 200, y: 200 };
    },
    args: {
      window,
      cursor: () => point,
      every: () => 1,
      stop: () => {},
      inspect: async () => {
        events.push("inspect");
        return target(sessions[0].title);
      },
      resolve: async (input) => resolveTarget(input, sessions),
      subscribe: async () => events.push("subscribe"),
      report: (state) => events.push(state.state),
    },
  };
}
test("a drag over Codex only moves and never inspects or subscribes", async () => {
  const f = dragFixture(),
    d = createDragController(f.args);
  d.start();
  f.move();
  const result = await d.end();
  assert.deepEqual(result, { click: false, moved: true });
  assert.deepEqual(f.events, []);
  assert.equal(f.args.window.getBounds().x, 190);
});
test("clicking the buddy does not subscribe", async () => {
  const f = dragFixture(),
    d = createDragController(f.args);
  d.start();
  assert.deepEqual(await d.end(), { click: true });
  assert.deepEqual(f.events, []);
});
test("a fast drag applies its final cursor delta without a timer tick", async () => {
  const f = dragFixture(),
    d = createDragController(f.args);
  d.start();
  f.move();
  await d.end();
  assert.equal(f.args.window.getBounds().y, 190);
});
test("pointer-down origin is retained across IPC delay", async () => {
  const f = dragFixture(),
    d = createDragController(f.args);
  f.move();
  d.start({ x: 100, y: 100 });
  await d.end();
  assert.equal(f.args.window.getBounds().x, 100);
});
test("cancel restores the original position", () => {
  const f = dragFixture(),
    d = createDragController(f.args);
  d.start();
  f.move();
  d.cancel();
  assert.equal(d.isDragging(), false);
});
