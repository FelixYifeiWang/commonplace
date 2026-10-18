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
test("private inboxes and agent conversations are navigation, including redirects", () => {
  for (const url of [
    "https://mail.google.com/mail/u/0/#inbox",
    "https://outlook.live.com/mail/0/",
    "https://chatgpt.com/c/abc",
    "https://chatgpt.com/g/project/c/abc",
    "https://chatgpt.com/codex/tasks/task_123",
    "https://claude.ai/chat/abc",
    "https://claude.ai/project/abc",
    "https://claude.ai/design/p/abc",
    "https://claude.ai/design",
    "https://claude.ai/code/abc",
    "https://cursor.com/dashboard",
    "https://example.com/auth/verify",
    "https://example.com/?code=abc&state=xyz",
  ])
    assert.equal(isReferenceUrl(url), false, url);
});
test("public agent references and product documentation remain collectible", () => {
  for (const url of [
    "https://chatgpt.com/share/abc",
    "https://claude.ai/share/abc",
    "https://cursor.com/docs",
    "https://claude.ai/",
    "https://openai.com/codex/",
    "https://example.com/blog/auth",
    "https://example.com/docs/login",
  ])
    assert.equal(isReferenceUrl(url), true, url);
});

import { referenceText, isReferenceItem } from "../lib/source-policy.mjs";
test("ambient browser locations are excluded but explicitly mentioned references remain", () => {
  const wrapper =
    "<in-app-browser-context>Current URL: https://example.com/</in-app-browser-context>";
  assert.equal(
    referenceText(wrapper + "\nSave https://notion.com/"),
    "\nSave https://notion.com/",
  );
  assert.equal(
    isReferenceItem({
      url: "https://example.com/",
      sourceText: wrapper + "\nMake the button smaller.",
    }),
    false,
  );
  assert.equal(
    isReferenceItem({
      url: "https://example.com/",
      sourceText: wrapper + "\nSave https://example.com/",
    }),
    true,
  );
  assert.equal(isReferenceItem({ url: "https://example.com/" }), true);
});
