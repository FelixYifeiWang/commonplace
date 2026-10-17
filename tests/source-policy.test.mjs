import test from "node:test";
import assert from "node:assert/strict";
import { isReferenceUrl } from "../lib/source-policy.mjs";
test("auth, callback, local and credential URLs are not research blocks", () => {
  for (const url of [
    "https://auth.openai.com/log-in",
    "https://accounts.google.com/",
    "https://example.com/oauth/callback?code=x",
    "https://example.com/login",
    "https://example.com/sign-in",
    "http://127.0.0.1:3100/",
    "https://example.com/?token=secret",
  ])
    assert.equal(isReferenceUrl(url), false, url);
});
test("articles about authentication and ordinary source paths remain", () => {
  for (const url of [
    "https://example.com/blog/authentication-design",
    "https://example.com/docs/oauth-guide",
    "https://notion.com/product",
    "https://example.com/author/alex",
  ])
    assert.equal(isReferenceUrl(url), true, url);
});
