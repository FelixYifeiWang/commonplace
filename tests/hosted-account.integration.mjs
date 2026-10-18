// Run only against the hosted app after configuring Google OAuth.
// This checks unauthenticated boundaries and the real OAuth start handler.
// It never follows Google's authorization URL or prints state/cookies.
import assert from "node:assert/strict";
import { createSession, SESSION_COOKIE } from "../lib/hosted-auth.mjs";
const base = process.env.COMMONPLACE_TEST_URL;
if (!base?.startsWith("https://"))
  throw new Error("Set the hosted HTTPS test URL.");
for (const headers of [
  {},
  { "oai-authenticated-user-id": "hosted-owner" },
  { Cookie: "__Secure-commonplace-account.session_token=invalid" },
  ...(process.env.COMMONPLACE_SESSION_SECRET
    ? [
        {
          Cookie: `${SESSION_COOKIE}=${createSession(process.env.COMMONPLACE_SESSION_SECRET)}`,
        },
      ]
    : []),
]) {
  assert.equal((await fetch(base + "/api/workspace", { headers })).status, 401);
}
assert.equal((await fetch(base + "/api/account/claim")).status, 401);
const start = (origin, callbackURL = "/") =>
  fetch(base + "/api/auth/sign-in/social", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      callbackURL,
      disableRedirect: true,
    }),
    redirect: "manual",
  });
assert.equal((await start("https://untrusted.example")).status, 403);
assert.equal((await start(base, "https://untrusted.example")).status, 403);
const response = await start(base);
assert.equal(response.status, 200);
const body = await response.json();
const url = new URL(body.url);
assert.equal(url.origin, "https://accounts.google.com");
assert.equal(
  url.searchParams.get("redirect_uri"),
  base + "/api/auth/callback/google",
);
assert.deepEqual(
  new Set(url.searchParams.get("scope").split(" ")),
  new Set(["openid", "email", "profile"]),
);
assert.ok(url.searchParams.get("state"));
assert.ok(url.searchParams.get("code_challenge"));
assert.equal(url.searchParams.get("code_challenge_method"), "S256");
assert.equal(url.searchParams.get("access_type"), "online");
const cookie = response.headers.get("set-cookie") || "";
assert.match(cookie, /HttpOnly/i);
assert.match(cookie, /Secure/i);
console.log(
  "Hosted Google OAuth start, PKCE, origin checks and account isolation passed.",
);
