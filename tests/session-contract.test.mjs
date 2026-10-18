import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionSchema,
  normalizeSession,
  sessionInstructions,
  validateSession,
} from "../lib/story.mjs";

const input = {
  channel: "Portfolio",
  guide: "",
  current: null,
  transcript: [
    {
      id: "t1",
      role: "user",
      text: "Strictly follow this as a lofi wireframe. Also look at https://www.hirotos.com/ this is the standard and the vibes I want",
    },
    {
      id: "t2",
      role: "assistant",
      text: "Built the ticket from the wireframe.",
    },
    {
      id: "t3",
      role: "user",
      text: "feedback: i really dislike custom cursors. it lags and stutters sometimes. UX first, then design.",
    },
    {
      id: "t4",
      role: "user",
      text: "https://atmos.leeroy.ca/ Good color palette and grained effect. I don't like the cloud shapes. Use Doto for WELCOME ABOARD.",
    },
  ],
  media: [
    {
      id: "m-sketch",
      title: "Ticket wireframe",
      kind: "image",
      url: null,
      note: "",
      context: "",
      madeByHuman: true,
    },
    {
      id: "m-ticket",
      title: "Shipped ticket",
      kind: "image",
      url: null,
      note: "",
      context: "",
    },
    {
      id: "m-ref",
      title: "hirotos.com",
      kind: "link",
      url: "https://www.hirotos.com/",
      note: "",
      context: "",
    },
  ],
};

const valid = () => ({
  steps: [
    {
      title: "The ticket, straight from my wireframe",
      text: "Drew the ticket myself and asked for it to be followed strictly. The shipped one keeps the same order, top to bottom.",
      canvas: {
        layout: "before-after",
        items: [
          { itemId: "m-sketch", role: "before", label: "My wireframe" },
          { itemId: "m-ticket", role: "after", label: "Shipped ticket" },
        ],
        quote: null,
      },
      evidence: [
        { sourceId: "t1", quote: "Strictly follow this as a lofi wireframe" },
      ],
    },
    {
      title: "Live, then a reality check",
      text: "A peer said the custom cursor had to go and the site lagged. Fair. Cursor out, and the slowest frame got way faster.",
      canvas: {
        layout: "quote",
        items: [],
        quote: { sourceId: "t3", text: "i really dislike custom cursors" },
      },
      evidence: [{ sourceId: "t3", quote: "it lags and stutters sometimes" }],
    },
  ],
  map: {
    center: { label: "eileen-z.com", itemId: null, url: null },
    nodes: [
      {
        label: "Ticket stub",
        kind: "component",
        weight: "major",
        font: null,
        summary: "White until hover, tucked down to the role",
        itemId: "m-ticket",
        url: null,
        evidence: {
          sourceId: "t2",
          quote: "Built the ticket from the wireframe.",
        },
        details: [
          {
            label: "Follows my wireframe",
            itemId: "m-sketch",
            url: null,
            evidence: {
              sourceId: "t1",
              quote: "Strictly follow this as a lofi wireframe",
            },
          },
        ],
      },
      {
        label: "References",
        kind: "reference",
        weight: "normal",
        font: null,
        summary: "hirotos.com: the standard for polish",
        itemId: "m-ref",
        url: "https://www.hirotos.com/",
        evidence: {
          sourceId: "t1",
          quote: "this is the standard and the vibes I want",
        },
        details: [
          {
            label: "atmos.leeroy.ca",
            itemId: null,
            url: "https://atmos.leeroy.ca/",
            evidence: {
              sourceId: "t4",
              quote: "Good color palette and grained effect",
            },
          },
        ],
      },
      {
        label: "Principles",
        kind: "principle",
        weight: "minor",
        font: null,
        summary: "Readability before effects",
        itemId: null,
        url: null,
        evidence: { sourceId: "t3", quote: "UX first, then design." },
        details: [],
      },
    ],
  },
});

test("a grounded story and gallery pass validation unchanged", () => {
  const out = validateSession(valid(), input);
  assert.equal(out.steps.length, 2);
  assert.equal(out.map.nodes.length, 3);
  assert.equal(out.map.nodes[1].details[0].url, "https://atmos.leeroy.ca/");
});

test("a canvas item that is not in the input is rejected", () => {
  const v = valid();
  v.steps[0].canvas.items[1].itemId = "invented";
  assert.throws(() => validateSession(v, input), /unavailable/);
});

test("a URL that never appeared in the session is rejected", () => {
  const v = valid();
  v.map.nodes[1].details[0].url = "https://invented.example/";
  assert.throws(() => validateSession(v, input), /URL/);
});

test("aggregate text such as '4 fixes after launch' is rejected", () => {
  for (const text of ["4 fixes after launch", "Several tweaks", "3 changes"]) {
    const v = valid();
    v.map.nodes[2].summary = text;
    assert.throws(() => validateSession(v, input), /specific/, text);
  }
  const v = valid();
  v.map.nodes[0].details[0].label = "2 updates";
  assert.throws(() => validateSession(v, input), /specific/);
});

test("a quote that is not in its source is rejected", () => {
  const v = valid();
  v.map.nodes[0].details[0].evidence.quote = "Make it pop";
  assert.throws(() => validateSession(v, input), /evidence/);
});

test("a story never has more than five steps", () => {
  const v = valid();
  v.steps = Array.from({ length: 6 }, () => valid().steps[0]);
  assert.throws(() => validateSession(v, input), /five/);
});

test("step text is a paragraph, not bullet points", () => {
  const v = valid();
  v.steps[0].text = "- Drew the ticket\n- Followed it strictly";
  assert.throws(() => validateSession(v, input), /paragraph/);
});

test("a reference named without a URL remains grounded in its evidence", () => {
  const v = valid();
  v.map.nodes[1].url = null;
  assert.equal(validateSession(v, input).map.nodes[1].url, null);
});

test("a canvas names one of the plain layouts", () => {
  const v = valid();
  v.steps[0].canvas.layout = "changelog";
  assert.throws(() => validateSession(v, input), /Invalid canvas/);
  const step = sessionSchema.properties.steps.items.properties;
  assert.deepEqual(step.canvas.properties.layout.enum, [
    "choice",
    "reference",
    "before-after",
    "detour",
    "quote",
    "none",
  ]);
});

test("a choice canvas has exactly one picked option", () => {
  const v = valid();
  v.steps[0].canvas = {
    layout: "choice",
    items: [
      { itemId: "m-sketch", role: "option", label: "Sketch" },
      { itemId: "m-ticket", role: "option", label: "Ticket" },
    ],
    quote: null,
  };
  assert.throws(() => validateSession(v, input), /picked/);
});

test("the same thing may not appear twice in the gallery", () => {
  const v = valid();
  v.map.nodes[2].details.push({ ...v.map.nodes[0].details[0] });
  assert.throws(() => validateSession(v, input), /twice/);
});

test("the gallery holds at most six nodes, each with at most three details", () => {
  const seven = valid();
  seven.map.nodes = Array.from({ length: 7 }, (_, i) => ({
    ...valid().map.nodes[2],
    label: `Principle ${i}`,
  }));
  assert.throws(() => validateSession(seven, input), /at most 6 nodes/);
  const crowded = valid();
  crowded.map.nodes[0].details = Array.from({ length: 4 }, (_, i) => ({
    ...valid().map.nodes[0].details[0],
    label: `Specific rule ${i}`,
  }));
  assert.throws(() => validateSession(crowded, input), /gallery node/);
});

test("the gallery does not link to story steps", () => {
  const node = sessionSchema.properties.map.properties.nodes.items.properties;
  assert.equal("step" in node, false);
  assert.equal("links" in sessionSchema.properties.map.properties, false);
});

test("the schema is valid for strict structured output", () => {
  const walk = (node, path) => {
    if (node && node.type === "object") {
      assert.equal(node.additionalProperties, false, path);
      assert.deepEqual(
        [...node.required].sort(),
        Object.keys(node.properties).sort(),
        path,
      );
      for (const [k, v] of Object.entries(node.properties))
        walk(v, `${path}.${k}`);
    }
    if (node && node.items) walk(node.items, `${path}[]`);
    for (const alt of node?.anyOf || []) walk(alt, path);
  };
  walk(sessionSchema, "root");
});

test("the instructions carry no rules specific to one session", () => {
  assert.doesNotMatch(
    sessionInstructions,
    /eileen|ticket|portfolio|hirotos|cursor|window|boarding/i,
  );
});

test("a picture belongs to one node or detail only", () => {
  const v = valid();
  v.map.nodes[0].details[0].itemId = "m-ticket";
  assert.throws(() => validateSession(v, input), /twice/);
});

test("not every node can be major", () => {
  const v = valid();
  for (const n of v.map.nodes) n.weight = "major";
  assert.throws(() => validateSession(v, input), /major/);
});

test("labels name content, never the format", () => {
  for (const label of [
    "Change log",
    "Before-after",
    "Sketch → shipped",
    "Step 3 canvas",
  ]) {
    const v = valid();
    v.steps[0].canvas.items[0].label = label;
    assert.throws(() => validateSession(v, input), /format/, label);
  }
  const v = valid();
  v.map.nodes[2].summary = "Session output overview";
  assert.throws(() => validateSession(v, input), /format|specific/);
});

test("story and gallery text stay short", () => {
  const long = valid();
  long.steps[0].title =
    "The ticket that I drew myself and then had built exactly";
  assert.throws(() => validateSession(long, input), /title/);
  const wordy = valid();
  wordy.map.nodes[0].summary =
    "White until you hover and then it fills with the colour of its project and rises";
  assert.throws(() => validateSession(wordy, input), /short line/);
});

test("a quote canvas does not repeat its paragraph", () => {
  const v = valid();
  v.steps[1].text =
    "A peer said i really dislike custom cursors, and the site lagged. Fair. Cursor out, and the slowest frame got way faster.";
  assert.throws(() => validateSession(v, input), /repeat/);
});

test("every step is grounded in the conversation, not only in saved items", () => {
  const v = valid();
  v.steps[0].evidence = [{ sourceId: "m-ref", quote: "hirotos.com" }];
  assert.throws(() => validateSession(v, input), /conversation/);
});

test("the gallery does not repeat the story", () => {
  const v = valid();
  v.map.nodes[0].label = "Live, then a reality check";
  assert.throws(() => validateSession(v, input), /repeat the story|1–4 words/);
});

test("a font node names a font and sample from the session", () => {
  const v = valid();
  v.map.nodes[2] = {
    ...v.map.nodes[2],
    label: "Pixel type",
    kind: "principle",
    summary: "Doto for the headline",
    font: { family: "Doto", sample: "WELCOME ABOARD" },
  };
  assert.equal(validateSession(v, input).map.nodes[2].font.family, "Doto");
  const invented = valid();
  invented.map.nodes[2].font = {
    family: "Comic Sans",
    sample: "WELCOME ABOARD",
  };
  assert.throws(() => validateSession(invented, input), /font/);
});

test("the gallery does not repeat its center", () => {
  const v = valid();
  v.map.center.url = "https://www.hirotos.com/";
  assert.throws(() => validateSession(v, input), /center/);
});

test("a canvas quote is one short line", () => {
  const text =
    "the receipt should be thinner, the stamp should land at the bottom right, and it should overlap the info a little when you reach the end";
  const long = {
    ...input,
    transcript: [...input.transcript, { id: "t5", role: "user", text }],
  };
  const v = valid();
  v.steps[1].canvas.quote = { sourceId: "t5", text };
  assert.throws(() => validateSession(v, long), /20 words/);
});

test("Chinese titles and concise paragraphs do not require English word spacing", () => {
  const value = valid();
  value.steps[0].title = "从草图开始";
  value.steps[0].text =
    "我希望先保留自己画的布局，再慢慢调整细节。每个元素的位置都应该跟着草图走。";
  const chineseInput = structuredClone(input);
  chineseInput.transcript[0].text += ` ${value.steps[0].text}`;
  assert.equal(
    validateSession(value, chineseInput).steps[0].title,
    "从草图开始",
  );
});

test("a repeated optional quote is removed without losing the story or evidence", () => {
  const value = valid();
  value.steps[1].text += " i really dislike custom cursors";
  const normalized = normalizeSession(value, input);
  assert.equal(normalized.steps[1].canvas.layout, "none");
  assert.equal(normalized.steps[1].canvas.quote, null);
  assert.deepEqual(normalized.steps[1].evidence, value.steps[1].evidence);
  assert.doesNotThrow(() => validateSession(normalized, input));
});

test("an exact quote assigned to the wrong source is corrected only when unambiguous", () => {
  const value = valid();
  value.steps[0].evidence[0].sourceId = "t3";
  const normalized = normalizeSession(value, input);
  assert.equal(normalized.steps[0].evidence[0].sourceId, "t1");
  assert.doesNotThrow(() => validateSession(normalized, input));
  value.steps[0].evidence[0].quote = "An invented claim";
  assert.throws(
    () => validateSession(normalizeSession(value, input), input),
    /evidence/,
  );
});

test("duplicate labels and pictures are reduced to one grounded representation", () => {
  const value = valid();
  value.map.nodes.push(structuredClone(value.map.nodes[0]));
  value.map.nodes[2].itemId = value.map.nodes[0].itemId;
  const clean = normalizeSession(value, input);
  assert.equal(clean.map.nodes.length, 3);
  assert.equal(clean.map.nodes[2].itemId, null);
  assert.doesNotThrow(() => validateSession(clean, input));
});

test("evidence can quote rendered Markdown without copying emphasis delimiters", () => {
  const source = structuredClone(input);
  source.transcript[0].text = source.transcript[0].text.replace(
    "Strictly follow this",
    "**Strictly follow** this",
  );
  assert.doesNotThrow(() => validateSession(valid(), source));
  const wrong = valid();
  wrong.steps[0].evidence[0].quote = "Loosely follow this as a lofi wireframe";
  assert.throws(() => validateSession(wrong, source), /evidence/);
});

test("extra major nodes keep their content at normal visual weight", () => {
  const value = valid();
  for (const node of value.map.nodes) node.weight = "major";
  const clean = normalizeSession(value, input);
  assert.deepEqual(
    clean.map.nodes.map((node) => node.weight),
    ["major", "major", "normal"],
  );
  assert.deepEqual(
    clean.map.nodes.map((node) => node.evidence),
    value.map.nodes.map((node) => node.evidence),
  );
  assert.doesNotThrow(() => validateSession(clean, input));
});
