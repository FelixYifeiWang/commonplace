import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareStoryBatch,
  validateStoryOutput,
  redactStoryText,
  emptyCheckpoint,
} from "../lib/story.mjs";
const item = {
  id: "media-1",
  title: "A sketch",
  body: "Keep the layout quiet.",
  sourceText: "Keep the layout quiet.",
  sourceTurn: "",
  kind: "note",
  url: null,
};
const job = {
  title: "A quiet canvas",
  checkpoint: emptyCheckpoint(),
  turns: [
    { id: "turn-1", sequence: 1, role: "user", body: "Keep the layout quiet." },
  ],
  items: [item],
  previous: [],
};
test("unchanged input advances no story and makes no model request", async () => {
  const first = await prepareStoryBatch(job);
  const next = await prepareStoryBatch({
    ...job,
    checkpoint: first.checkpoint,
  });
  assert.equal(next.needsModel, false);
});
test("long turns are consumed across batches without dropping their tail", async () => {
  const first = await prepareStoryBatch(job, { maxCharacters: 8 });
  const next = await prepareStoryBatch({
    ...job,
    checkpoint: first.checkpoint,
  });
  assert.equal(
    first.input.transcript[0].text + next.input.transcript[0].text,
    job.turns[0].body,
  );
  assert.equal(first.hasMore, true);
  assert.equal(next.hasMore, false);
});
test("new media appends while old history remains context", async () => {
  const first = await prepareStoryBatch(job);
  const next = await prepareStoryBatch({
    ...job,
    checkpoint: first.checkpoint,
    items: [item, { ...item, id: "new" }],
    previous: [
      {
        title: "Quiet first",
        text: "The layout was simplified.",
        connections: [{ itemId: item.id, label: "layout" }],
      },
    ],
  });
  assert.equal(next.input.transcript.length, 0);
  assert.equal(next.input.media.filter((i) => i.new).length, 1);
  assert.equal(next.input.previous[0].title, "Quiet first");
});
test("deleted and utility sources are excluded; restoration does not repeat the story", async () => {
  const first = await prepareStoryBatch(job);
  const removed = await prepareStoryBatch({
    ...job,
    checkpoint: first.checkpoint,
    items: [],
  });
  const restored = await prepareStoryBatch({
    ...job,
    checkpoint: removed.checkpoint,
  });
  assert.equal(restored.needsModel, false);
  const auth = await prepareStoryBatch({
    ...job,
    turns: [],
    items: [{ ...item, url: "https://auth.openai.com/log-in" }],
  });
  assert.equal(auth.needsModel, false);
});
test("preview enrichment does not create another story event", async () => {
  const source = { ...item, url: "https://example.com", kind: "link" };
  const first = await prepareStoryBatch({ ...job, items: [source] });
  const next = await prepareStoryBatch({
    ...job,
    checkpoint: first.checkpoint,
    items: [{ ...source, title: "Enriched title", body: "New metadata" }],
  });
  assert.equal(next.needsModel, false);
});
test("credentials are removed before provider input", () => {
  assert.equal(
    redactStoryText("key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789"),
    "key [redacted key]",
  );
  assert.equal(
    redactStoryText("API_KEY=abcdefghijklmnop"),
    "API_KEY=[redacted]",
  );
});
test("invented sources and ungrounded quotes reject the entire response", async () => {
  const { input } = await prepareStoryBatch(job);
  const beat = {
    title: "Quiet first",
    text: "The layout became quieter.",
    connections: [{ itemId: item.id, label: "Layout direction" }],
    evidence: [{ sourceId: "turn-1", quote: "Keep the layout quiet." }],
  };
  assert.equal(validateStoryOutput({ beats: [beat] }, input).length, 1);
  assert.throws(() =>
    validateStoryOutput(
      {
        beats: [
          { ...beat, connections: [{ itemId: "invented", label: "No" }] },
        ],
      },
      input,
    ),
  );
  assert.throws(() =>
    validateStoryOutput(
      {
        beats: [
          {
            ...beat,
            evidence: [{ sourceId: "turn-1", quote: "Unspoken decision" }],
          },
        ],
      },
      input,
    ),
  );
});

test("future references wait for their part of a long transcript", async () => {
  const batch = await prepareStoryBatch(
    { ...job, items: [{ ...item, sourceTurn: "later" }] },
    { maxCharacters: 8 },
  );
  assert.equal(batch.input.media.length, 0);
  assert.equal(batch.hasMore, true);
});

test("empty turns advance the checkpoint without requesting generation", async () => {
  const batch = await prepareStoryBatch({
    ...job,
    items: [],
    turns: [{ id: "empty", sequence: 2, role: "assistant", body: "" }],
  });
  assert.equal(batch.checkpoint.turnSequence, 2);
  assert.equal(batch.hasMore, false);
  assert.equal(batch.needsModel, false);
});

test("a credential crossing batch boundaries never leaks either half", async () => {
  const body = "Before sk-proj-abcdefghijklmnopqrstuvwxyz0123456789 after";
  const secretJob = {
    ...job,
    items: [],
    turns: [{ id: "secret-turn", sequence: 1, role: "user", body }],
  };
  const first = await prepareStoryBatch(secretJob, { maxCharacters: 30 });
  const second = await prepareStoryBatch({
    ...secretJob,
    checkpoint: first.checkpoint,
  });
  const combined =
    first.input.transcript[0].text + second.input.transcript[0].text;
  assert.ok(!combined.includes("abcdef") && !combined.includes("0123456789"));
  assert.equal(combined.length, body.length);
  assert.ok(combined.endsWith(" after"));
});

test("previously processed media remains available for richer visual connections", async () => {
  const item = {
    id: "earlier",
    title: "A reference",
    url: "https://example.com/research",
    kind: "link",
    body: "",
    sourceText: "Use this reference",
    sourceTurn: "",
  };
  const job = {
    title: "Research",
    turns: [],
    items: [item],
    previous: [],
    checkpoint: {},
  };
  const first = await prepareStoryBatch(job);
  const next = await prepareStoryBatch({
    ...job,
    checkpoint: first.checkpoint,
    turns: [
      {
        id: "new-turn",
        sequence: 1,
        role: "user",
        body: "Keep that reference for the visual direction.",
      },
    ],
  });
  assert.equal(
    next.input.media.some((m) => m.id === "earlier" && !m.new),
    true,
  );
});
