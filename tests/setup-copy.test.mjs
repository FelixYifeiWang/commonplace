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
