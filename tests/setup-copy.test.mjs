import test from "node:test";
import assert from "node:assert/strict";
import { setupInstructions } from "../lib/setup-instructions.mjs";
test("setup gives a separate first-collection step and cannot authorize capture", () => {
  const text = setupInstructions("https://space.example");
  assert.match(text, /Do not read, import or subscribe/);
  assert.match(text, /Choose Connect a session/);
  assert.doesNotMatch(text, /—/);
});
test("connection instructions explicitly target the chosen conversation", () => {
  const text = setupInstructions("https://space.example", "connect");
  assert.match(text, /Connect only the conversation/);
  assert.match(text, /Session connected/);
  assert.doesNotMatch(text, /—/);
});

test("setup checks the execution environment and requests scoped access before installing", () => {
  const text = setupInstructions("https://space.example");
  assert.match(text, /Confirm the terminal runs on the user's Mac/);
  assert.match(text, /normal permission request/);
  assert.match(text, /Library\/LaunchAgents/);
  assert.match(text, /Do not retry a denied operation/);
  assert.match(text, /cannot resolve.*network access/i);
  assert.ok(
    text.indexOf("Confirm the terminal") < text.indexOf("Download https://"),
  );
});
