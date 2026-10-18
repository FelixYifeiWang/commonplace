import test from "node:test";
import assert from "node:assert/strict";
import { collectionReferenceMarkdown } from "../lib/collection-reference.mjs";
test("reference Markdown includes usable sources, redacts keys and excludes navigation", () => {
  const prompt = collectionReferenceMarkdown(
    { name: "Quiet", description: "Design references" },
    [
      {
        title: "Source",
        url: "https://example.com/reference",
        body: "Use generous spacing.",
      },
      { title: "Login", url: "https://auth.openai.com/log-in" },
      {
        title: "Private",
        body: "key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789",
      },
    ],
  );
  assert.match(prompt, /https:\/\/example.com\/reference/);
  assert.match(prompt, /generous spacing/);
  assert.doesNotMatch(prompt, /auth.openai|sk-proj/);
  assert.match(prompt, /Do not collect or connect/);
});
