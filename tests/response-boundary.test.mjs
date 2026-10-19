import test from "node:test";
import assert from "node:assert/strict";
import { createResponseBoundary } from "../desktop/response-boundary.mjs";
import {
  captureBoundarySQL,
  RESPONSE_QUIET_MS,
} from "../lib/capture-boundary.mjs";
test("Codex completion closes a turn but a new task reopens it", () => {
  const b = createResponseBoundary();
  b.read(
    JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
  );
  assert.equal(b.snapshot().responseState, "running");
  b.read(
    JSON.stringify({
      type: "response_item",
      payload: {
        role: "assistant",
        content: [{ type: "output_text", text: "Still working" }],
      },
    }),
  );
  assert.equal(b.snapshot().responseState, "running");
  b.read(
    JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } }),
  );
  assert.equal(b.snapshot().responseState, "complete");
  b.read(
    JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }),
  );
  assert.equal(b.snapshot().responseState, "running");
});
test("Claude tool-use is not completion; end_turn is", () => {
  const b = createResponseBoundary();
  b.read(
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [], stop_reason: "tool_use" },
    }),
  );
  assert.notEqual(b.snapshot().responseState, "complete");
  b.read(
    JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [], stop_reason: "end_turn" },
    }),
  );
  assert.equal(b.snapshot().responseState, "complete");
  b.read(JSON.stringify({ type: "progress" }));
  assert.equal(b.snapshot().responseState, "complete");
});
test("unknown transcript formats use quiet fallback and partial JSON is ignored", () => {
  const b = createResponseBoundary();
  b.read("{");
  assert.equal(b.snapshot().responseState, "unknown");
  b.read(JSON.stringify({ role: "assistant", content: "Reply" }));
  assert.equal(b.snapshot().responseState, "unknown");
});
test("empty heartbeats do not prolong a busy response; final completion releases import hold", () => {
  const session = { activityKey: "a" };
  const now = 1000;
  assert.equal(
    captureBoundarySQL({
      session,
      activityId: "a",
      responseState: "busy",
      syncComplete: true,
      hasTurns: false,
      now,
    }),
    null,
  );
  assert.equal(
    captureBoundarySQL({
      session,
      activityId: "b",
      responseState: "unknown",
      syncComplete: true,
      hasTurns: true,
      now,
    }).holdUntil,
    now + RESPONSE_QUIET_MS,
  );
  assert.equal(
    captureBoundarySQL({
      session,
      activityId: "b",
      responseState: "complete",
      syncComplete: false,
      hasTurns: true,
      now,
    }).holdUntil,
    now + RESPONSE_QUIET_MS,
  );
  assert.equal(
    captureBoundarySQL({
      session,
      activityId: "b",
      responseState: "complete",
      syncComplete: true,
      hasTurns: false,
      now,
    }).holdUntil,
    now + 8000,
  );
});

test("repeated completed-response heartbeats do not keep pushing the publish deadline", () => {
  assert.equal(
    captureBoundarySQL({
      session: { activityKey: "a" },
      activityId: "a",
      responseState: "complete",
      syncComplete: true,
      hasTurns: false,
      now: 1000,
    }),
    null,
  );
});

test("known running responses stay held while Nox heartbeats, even during a long tool call", () => {
  const boundary = captureBoundarySQL({
    session: { activityKey: "a" },
    activityId: "a",
    responseState: "running",
    syncComplete: true,
    hasTurns: false,
    now: 100000,
  });
  assert.equal(boundary.holdUntil, 190000);
  assert.equal(boundary.invalidate, false);
});
