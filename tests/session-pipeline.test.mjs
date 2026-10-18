import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSession,
  cleanSessionText,
  isSessionNoise,
  prepareSessionBatch,
  emptyCheckpoint,
} from "../lib/story.mjs";
import { generateSession } from "../lib/story-provider.mjs";
import { classifyImage, cutOut } from "../lib/image-fit.mjs";

// ---------- input: what the model reads ----------
test("tool and system chatter never reaches the model", () => {
  for (const text of [
    "<task-notification>\n<task-id>abc</task-id>",
    "<system-reminder>Whenever you read a file…</system-reminder>",
    "[Request interrupted by user]",
    "This session is being continued from a previous conversation that ran out of context.",
    "<local-command-stdout>ok</local-command-stdout>",
    "<environment_context>cwd</environment_context>",
    "# AGENTS.md instructions for /repo",
  ])
    assert.equal(isSessionNoise(text), true, text);
  assert.equal(
    isSessionNoise("Strictly follow this as a lofi wireframe"),
    false,
  );
});

test("app wrappers are stripped and the request inside them is kept", () => {
  assert.equal(
    cleanSessionText(
      '\n<in-app-browser-context source="ambient-ui-state">\nThis block is automatically supplied ambient UI state.\n- Current URL: http://127.0.0.1:8795/\n</in-app-browser-context>\n\n## My request:\nsite can\'t be reached\n',
    ),
    "site can't be reached",
  );
  assert.equal(
    cleanSessionText(
      '<external_codex_apps_open_page>{"page_id":null}</external_codex_apps_open_page>',
    ),
    "",
  );
  assert.equal(
    cleanSessionText(
      '\n# Files mentioned by the user:\n\n## ref.png: /Users/someone/ref.png\nImage attachment: true\n\n## My request:\nmake it minimal\n<image name=[Image #1] path="/Users/someone/ref.png">\n</image>',
    ),
    "make it minimal",
  );
});

test("the human's answer to a question from the assistant is kept as plain text", () => {
  assert.equal(
    cleanSessionText(
      '<send_user_message_question_reply>\n[{"questionItemId":"q1","question":"Which account should own the site?","answer":"no, please create a repo"}]\n</send_user_message_question_reply>',
    ),
    "Which account should own the site? → no, please create a repo",
  );
});

test("a turn that held only app state is dropped, a wrapped request is kept clean", async () => {
  const batch = await prepareSessionBatch({
    title: "Receipt",
    checkpoint: emptyCheckpoint(),
    items: [],
    previous: [],
    turns: [
      {
        id: "w1",
        sequence: 1,
        role: "user",
        body: '<external_codex_apps_open_page>{"page_id":null}</external_codex_apps_open_page>',
      },
      {
        id: "w2",
        sequence: 2,
        role: "user",
        body: '<in-app-browser-context source="ambient-ui-state">\nstate\n</in-app-browser-context>\n\n## My request:\nmake the receipt thinner',
      },
    ],
  });
  assert.deepEqual(batch.input.transcript, [
    {
      id: "w2",
      role: "user",
      text: "make the receipt thinner",
      continued: false,
    },
  ]);
});

const job = {
  title: "Portfolio",
  checkpoint: emptyCheckpoint(),
  guide: "keep it casual",
  current: {
    steps: [],
    map: {
      center: { label: "site", itemId: null, url: null },
      nodes: [{ itemId: "kept", details: [] }],
    },
  },
  turns: [
    {
      id: "t1",
      sequence: 1,
      role: "user",
      body: "Strictly follow this as a lofi wireframe",
    },
    {
      id: "t2",
      sequence: 2,
      role: "user",
      body: "<task-notification>done</task-notification>",
    },
    {
      id: "t3",
      sequence: 3,
      role: "assistant",
      body: "Built it from the wireframe.",
    },
  ],
  items: [
    {
      id: "pasted",
      title: "My sketch",
      body: "",
      sourceText: "",
      sourceTurn: "t1",
      sourceRole: "user",
      kind: "image",
      url: null,
    },
    {
      id: "kept",
      title: "Ticket",
      body: "",
      sourceText: "",
      sourceTurn: "",
      sourceRole: "assistant",
      kind: "image",
      url: null,
    },
  ],
  previous: [],
};

test("the session input drops noise and carries the current story, guide and who added each item", async () => {
  const batch = await prepareSessionBatch(job);
  assert.deepEqual(
    batch.input.transcript.map((t) => t.id),
    ["t1", "t3"],
  );
  assert.equal(batch.input.guide, "keep it casual");
  assert.equal(batch.input.current, job.current);
  assert.equal(
    batch.input.media.find((m) => m.id === "pasted").fromHuman,
    true,
  );
  assert.equal("previous" in batch.input, false);
});

test("items already on the story or gallery stay available to later batches", async () => {
  const first = await prepareSessionBatch(job);
  const next = await prepareSessionBatch({
    ...job,
    checkpoint: first.checkpoint,
    turns: [
      ...job.turns,
      { id: "t4", sequence: 4, role: "user", body: "make it bigger" },
    ],
  });
  assert.ok(next.input.media.some((m) => m.id === "kept"));
});

// ---------- the model call ----------
const input = {
  channel: "Portfolio",
  guide: "",
  current: null,
  transcript: [
    {
      id: "t1",
      role: "user",
      text: "Strictly follow this as a lofi wireframe",
    },
  ],
  media: [
    {
      id: "m1",
      title: "Sketch",
      kind: "image",
      url: null,
      note: "",
      context: "",
      fromHuman: true,
    },
  ],
};
const reply = (body) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(body) }],
      },
    ],
  });

test("the session call uses strict structured output, no tools and no provider storage, limited to known IDs", async () => {
  let body;
  await assert.rejects(
    generateSession(input, {
      apiKey: "test-only",
      transport: async (_url, opts) => {
        body = JSON.parse(opts.body);
        return reply({
          steps: [],
          map: {
            center: { label: "x", itemId: null, url: null },
            nodes: Array(7).fill({}),
          },
        });
      },
    }),
  );
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.tools, undefined);
  const step = body.text.format.schema.properties.steps.items.properties;
  assert.deepEqual(step.canvas.properties.items.items.properties.itemId.enum, [
    "m1",
  ]);
  assert.deepEqual(step.evidence.items.properties.sourceId.enum, ["t1", "m1"]);
});

test("a response that fails validation is retried once, then rejected", async () => {
  let calls = 0;
  await assert.rejects(
    generateSession(input, {
      apiKey: "test-only",
      transport: async () => {
        calls++;
        return reply({
          steps: [],
          map: {
            center: { label: "x", itemId: null, url: null },
            nodes: Array(7).fill({}),
          },
        });
      },
    }),
    /gallery/,
  );
  assert.equal(calls, 2);
});

test("the retry tells the model which rule the first attempt broke", async () => {
  const sent = [];
  await assert.rejects(
    generateSession(input, {
      apiKey: "test-only",
      transport: async (_url, opts) => {
        sent.push(JSON.parse(opts.body).instructions);
        return reply({
          steps: [],
          map: {
            center: { label: "x", itemId: null, url: null },
            nodes: Array(7).fill({}),
          },
        });
      },
    }),
  );
  assert.doesNotMatch(sent[0], /rejected/);
  assert.match(sent[1], /rejected: The gallery holds at most 6 nodes/);
});

test("provider errors never expose the credential", async () => {
  await assert.rejects(
    generateSession(input, {
      apiKey: "private-value",
      transport: async () => {
        throw new Error("bad header private-value");
      },
    }),
    (e) => !e.message.includes("private-value"),
  );
});

// ---------- image fitting: page, object or ink ----------
function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { data, width, height };
}
const white = [255, 255, 255];

test("dark marks on white are ink, and blend into the sheet", () => {
  const sketch = image(60, 40, (x, y) =>
    y === 20 || x === 30 ? [20, 40, 200] : white,
  );
  assert.equal(classifyImage(sketch).kind, "ink");
});

test("a solid shape on a plain ground is an object, cut out and trimmed to itself", () => {
  const ticket = image(60, 40, (x, y) =>
    x >= 20 && x < 40 && y >= 10 && y < 30 ? [40, 70, 220] : white,
  );
  const fit = classifyImage(ticket);
  assert.equal(fit.kind, "object");
  const cut = cutOut(ticket);
  assert.deepEqual([cut.width, cut.height], [20, 20]);
  assert.equal(cut.data[3], 255);
  const corner = cutOut(
    image(60, 40, (x, y) =>
      x >= 20 && x < 40 && y >= 10 && y < 30 ? [40, 70, 220] : white,
    ),
    { trim: false },
  );
  assert.equal(corner.data[3], 0);
});

test("an image with a busy edge is a page or scene and is never cut out", () => {
  const page = image(60, 40, (x, y) => [
    (x * 37) % 255,
    (y * 53) % 255,
    ((x + y) * 29) % 255,
  ]);
  assert.equal(classifyImage(page).kind, "page");
});

test("the edge colour of an object is kept, so a coloured ground can be matched", () => {
  const onGrey = image(50, 50, (x, y) =>
    x > 15 && x < 35 && y > 15 && y < 35 ? [10, 10, 10] : [230, 230, 228],
  );
  assert.deepEqual(classifyImage(onGrey).matColor, [230, 230, 228]);
});

test("a website capture is always a page, even when it is mostly white", () => {
  const sparseSite = image(60, 40, (x, y) =>
    x % 4 === 0 && y % 4 === 0 && x > 4 && x < 44 && y > 4 && y < 30
      ? [0, 0, 0]
      : white,
  );
  assert.equal(classifyImage(sparseSite).kind, "ink");
  assert.equal(classifyImage(sparseSite, { source: "website" }).kind, "page");
});

test("noise-only batches advance the raw cursor so long imports cannot stall", async () => {
  const body = "<task-notification>nothing to collect</task-notification>";
  const result = await prepareSessionBatch({
    ...job,
    current: null,
    items: [],
    turns: [{ id: "noise", sequence: 99, role: "user", body }],
    moreTurns: true,
  });
  assert.equal(result.checkpoint.turnSequence, 99);
  assert.equal(result.checkpoint.turnOffset, body.length);
  assert.equal(result.needsModel, false);
});

test("continued generation includes verified historical turns for unchanged story evidence", async () => {
  const result = await prepareSessionBatch({
    ...job,
    history: [{ id: "old", role: "user", body: "Keep this exact choice." }],
  });
  assert.ok(
    result.input.transcript.some(
      (t) =>
        t.id === "old" && t.historical && t.text === "Keep this exact choice.",
    ),
  );
});

test("routine-only sessions can be empty without inventing decisions", () => {
  const result = validateSession(
    {
      steps: [],
      map: {
        center: { label: "Untitled", itemId: null, url: null },
        nodes: [],
      },
    },
    input,
  );
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.map.nodes, []);
});

test("a split turn retains earlier evidence when its next chunk arrives", async () => {
  const body = "We picked blue. Then we picked serif.";
  const result = await prepareSessionBatch({
    ...job,
    items: [],
    checkpoint: { turnSequence: 10, turnOffset: 16, items: {} },
    turns: [{ id: "split", sequence: 10, role: "user", body }],
    history: [{ id: "split", role: "user", body }],
  });
  const source = result.input.transcript.find((t) => t.id === "split");
  assert.match(source.text, /We picked blue/);
  assert.match(source.text, /serif/);
  assert.equal(
    result.input.transcript.filter((t) => t.id === "split").length,
    1,
  );
  assert.equal(result.needsModel, true);
});
