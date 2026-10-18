import test from "node:test";
import assert from "node:assert/strict";
import { signInOriginRedirect } from "../lib/auth-origin.mjs";

test("old-domain sign-in moves to Newron before creating OAuth state", () => {
  assert.equal(
    signInOriginRedirect(
      "https://commonplace-pearl.vercel.app",
      "https://newron.app",
    ),
    "https://newron.app/sign-in",
  );
});
test("canonical sign-in proceeds without redirecting", () => {
  assert.equal(
    signInOriginRedirect("https://newron.app", "https://newron.app/"),
    null,
  );
});
test("deployment aliases also use the configured OAuth origin", () => {
  assert.equal(
    signInOriginRedirect(
      "https://newron-preview.vercel.app",
      "https://newron.app",
    ),
    "https://newron.app/sign-in",
  );
});
test("an explicitly configured local auth origin stays local", () => {
  assert.equal(
    signInOriginRedirect("http://localhost:3100", "http://localhost:3100"),
    null,
  );
});
