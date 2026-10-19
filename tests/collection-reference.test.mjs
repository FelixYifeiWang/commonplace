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

test("attachment references include scoped media and type without storage keys", () => {
  const reference = "https://newron.app/r/" + "a".repeat(48) + ".md";
  const prompt = collectionReferenceMarkdown(
    { name: "Visuals" },
    [
      {
        id: "image-1",
        kind: "image",
        title: "Sketch",
        fileKey: "users/private/key.png",
        mimeType: "image/png",
      },
    ],
    reference,
  );
  assert.match(
    prompt,
    new RegExp(reference.replaceAll(".", "\\.") + "/media/image-1"),
  );
  assert.match(prompt, /image\/png/);
  assert.doesNotMatch(prompt, /users\/private/);
});
