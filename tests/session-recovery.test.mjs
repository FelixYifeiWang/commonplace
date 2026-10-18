import test from "node:test";
import assert from "node:assert/strict";
import {
  excerptCatalog,
  hydrateEvidence,
  recoverSession,
  sourcePreview,
} from "../lib/session-recovery.mjs";
const input = {
  channel: "Portfolio",
  transcript: [
    {
      id: "t1",
      role: "user",
      text: "Make a quiet portfolio with large photographs and short descriptions for each of my selected projects.",
    },
  ],
  media: [
    {
      id: "m1",
      title: "Photography",
      kind: "image",
      url: null,
      note: "Portrait photographs",
      context: "",
    },
  ],
};
const step = () => ({
  title: "A quiet portfolio",
  text: input.transcript[0].text,
  canvas: {
    layout: "reference",
    items: [{ itemId: "m1", role: "reference", label: "Photography" }],
    words: null,
  },
  evidence: [{ sourceId: "t1", quote: input.transcript[0].text }],
});
const doc = () => ({
  steps: [step()],
  map: { center: { label: "Portfolio", itemId: null, url: null }, nodes: [] },
});
test("the backend inserts exact excerpts and rejects invented excerpt IDs", () => {
  const catalog = excerptCatalog(input);
  const value = doc();
  value.steps[0].evidence = [{ excerptId: catalog[0].id }];
  assert.deepEqual(
    hydrateEvidence(value, catalog).steps[0].evidence,
    step().evidence,
  );
  value.steps[0].evidence = [{ excerptId: "foreign" }];
  assert.throws(() => hydrateEvidence(value, catalog), /excerpt/);
});
test("excerpt menu includes existing evidence beyond the first lines", () => {
  const source = {
    ...input,
    transcript: [
      { id: "t1", text: "Opening.\n".repeat(20) + "Keep the old choice." },
    ],
    current: {
      steps: [
        { evidence: [{ sourceId: "t1", quote: "Keep the old choice." }] },
      ],
    },
  };
  assert.ok(
    excerptCatalog(source).some((e) => e.quote === "Keep the old choice."),
  );
});
test("bad optional canvas cannot discard a verified paragraph", () => {
  const value = doc();
  value.steps[0].canvas = {
    layout: "words",
    items: [],
    words: {
      form: "line",
      rows: [{ label: "", text: "Invented", sourceId: "t1" }],
    },
  };
  const recovered = recoverSession(value, input);
  assert.equal(recovered.steps[0].text, step().text);
  assert.equal(recovered.steps[0].canvas.layout, "none");
});
test("unsupported sections are excluded without losing valid sections", () => {
  const value = doc();
  value.steps.push({
    ...step(),
    title: "Unsupported decision",
    evidence: [{ sourceId: "other-user", quote: "invented" }],
  });
  const recovered = recoverSession(value, input);
  assert.equal(recovered.steps.length, 1);
  assert.deepEqual(recovered.steps[0].evidence, step().evidence);
});
test("initial preview uses literal user excerpts and curated references, never secrets or removed items", () => {
  const preview = sourcePreview(
    "Portfolio",
    [
      { id: "t1", role: "user", body: input.transcript[0].text },
      { id: "secret", role: "system", body: "private system instruction" },
    ],
    [
      { ...input.media[0], body: "Portrait photographs" },
      {
        id: "deleted",
        title: "Deleted",
        kind: "image",
        deletedAt: "2026-01-01",
      },
      {
        id: "auth",
        title: "Sign in",
        kind: "link",
        url: "https://auth.openai.com/log-in",
        sourceRole: "assistant",
      },
    ],
  );
  assert.equal(preview.steps[0].text, input.transcript[0].text);
  assert.deepEqual(
    preview.map.nodes.map((n) => n.itemId),
    ["m1"],
  );
  assert.ok(!JSON.stringify(preview).includes("private system"));
});
test("empty collections stay empty rather than inventing a story", () => {
  assert.equal(sourcePreview("Empty", [], []), null);
});

import { generateSession } from "../lib/story-provider.mjs";
const reply = (value) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  });
test("provider selects an excerpt ID and persisted evidence is inserted by the server", async () => {
  const result = await generateSession(input, {
    apiKey: "test-only",
    transport: async (_, options) => {
      const request = JSON.parse(options.body),
        payload = JSON.parse(request.input);
      const value = doc();
      value.steps[0].evidence = [
        { excerptId: payload.excerpts.find((e) => e.sourceId === "t1").id },
      ];
      return reply(value);
    },
  });
  assert.deepEqual(result.steps[0].evidence, step().evidence);
});
test("retry carries verified sections and final rejection retains them without accepting invented evidence", async () => {
  let calls = 0;
  await assert.rejects(
    generateSession(input, {
      apiKey: "test-only",
      transport: async (_, options) => {
        calls++;
        const payload = JSON.parse(JSON.parse(options.body).input);
        if (calls === 2) assert.equal(payload.validatedDraft.steps.length, 1);
        const value = doc();
        value.steps.push({
          ...step(),
          title: "Unsupported decision",
          evidence: [{ sourceId: "t1", quote: "Invented choice" }],
        });
        return reply(value);
      },
    }),
    (error) => {
      assert.equal(error.partial.steps.length, 1);
      assert.match(error.diagnostic, /Source validation/);
      assert.doesNotMatch(error.diagnostic, /Invented choice/);
      return true;
    },
  );
  assert.equal(calls, 2);
});
