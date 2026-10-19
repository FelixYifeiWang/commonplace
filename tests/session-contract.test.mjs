import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  sessionSchema,
  normalizeSession,
  normalizeCuratedSession,
  sessionInstructions,
  validateSession,
  sessionURLs,
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
        words: null,
      },
      evidence: [
        { sourceId: "t1", quote: "Strictly follow this as a lofi wireframe" },
      ],
    },
    {
      title: "Live, then a reality check",
      text: "A peer said the custom cursor had to go and the site lagged. Fair. Cursor out, and the slowest frame got way faster.",
      canvas: {
        layout: "words",
        items: [],
        words: {
          form: "line",
          rows: [
            {
              label: "A peer",
              text: "i really dislike custom cursors",
              sourceId: "t3",
            },
          ],
        },
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
    "words",
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
    words: null,
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

test("a line on the canvas does not repeat its paragraph", () => {
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
  v.steps[1].canvas.words.rows = [{ label: "You", text, sourceId: "t5" }];
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

test("a repeated line is removed without losing the story or evidence", () => {
  const value = valid();
  value.steps[1].text += " i really dislike custom cursors";
  const normalized = normalizeSession(value, input);
  assert.equal(normalized.steps[1].canvas.layout, "none");
  assert.equal(normalized.steps[1].canvas.words, null);
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

test("visible Markdown does not reject a genuine quote or allow a changed meaning", () => {
  const source = structuredClone(input),
    output = valid();
  source.transcript[0].text =
    "Strictly **follow this** as a lofi wireframe. Also look at https://www.hirotos.com/ this is the standard and the vibes I want";
  assert.doesNotThrow(() => validateSession(output, source));
  source.transcript[0].text = source.transcript[0].text.replace(
    "follow this",
    "do not follow this",
  );
  assert.throws(() => validateSession(output, source), /exact copy/);
});

const words = (form, rows) => {
  const v = valid();
  v.steps[1].canvas.words = { form, rows };
  return v;
};

test("a step with no picture shows what happened as a flow, change, spec, line or number", () => {
  const flow = words("flow", [
    { label: "", text: "Follow the lofi wireframe", sourceId: "t1" },
    { label: "", text: "Good color palette", sourceId: "t4" },
    { label: "", text: "Use Doto", sourceId: "t4" },
  ]);
  assert.equal(validateSession(flow, input).steps[1].canvas.words.form, "flow");
  const spec = words("spec", [
    { label: "Cursor", text: "custom cursors out", sourceId: "t3" },
    { label: "Order", text: "UX first, then design", sourceId: "t3" },
  ]);
  assert.equal(
    validateSession(spec, input).steps[1].canvas.words.rows.length,
    2,
  );
});

test("canvas words come from the session", () => {
  const v = words("spec", [
    { label: "Mood", text: "Quantum velvet sunrise", sourceId: "t3" },
    { label: "Order", text: "UX first, then design", sourceId: "t3" },
  ]);
  assert.throws(() => validateSession(v, input), /from the session/);
});

test("a row may use words from anywhere in the conversation, not only its cited line", () => {
  const v = words("spec", [
    { label: "Palette", text: "Good color palette", sourceId: "t3" },
    { label: "Order", text: "UX first, then design", sourceId: "t3" },
  ]);
  assert.equal(validateSession(v, input).steps[1].canvas.words.rows.length, 2);
});

test("a change shows what it was and what it became", () => {
  const v = words("change", [
    { label: "Cursor", text: "custom cursors", sourceId: "t3" },
  ]);
  assert.throws(() => validateSession(v, input), /change/);
});

test("a flow has three to five steps", () => {
  const v = words("flow", [
    { label: "", text: "Follow the lofi wireframe", sourceId: "t1" },
  ]);
  assert.throws(() => validateSession(v, input), /flow/);
});

test("a line is copied exactly from the session", () => {
  const v = words("line", [
    { label: "You", text: "i truly dislike custom cursors", sourceId: "t3" },
  ]);
  assert.throws(() => validateSession(v, input), /exact|evidence/);
});

test("a number is one the session states", () => {
  const v = words("number", [
    { label: "Slowest frame", text: "117 → 17 ms", sourceId: "t3" },
  ]);
  assert.throws(() => validateSession(v, input), /from the session/);
});

test("canvas rows are a few words each", () => {
  const v = words("spec", [
    {
      label: "Cursor",
      text: "i really dislike custom cursors it lags and stutters sometimes",
      sourceId: "t3",
    },
    { label: "Order", text: "UX first, then design", sourceId: "t3" },
  ]);
  assert.throws(() => validateSession(v, input), /few words/);
});

test("pictures and words do not share a canvas", () => {
  const v = valid();
  v.steps[0].canvas.words = {
    form: "line",
    rows: [{ label: "You", text: "Strictly follow this", sourceId: "t1" }],
  };
  assert.throws(() => validateSession(v, input), /words/);
});

test("a quote may differ from its source only in capitals and quote marks", () => {
  const v = valid();
  v.steps[0].evidence = [
    { sourceId: "t1", quote: "STRICTLY follow this as a lofi wireframe" },
  ];
  assert.equal(validateSession(v, input).steps.length, 2);
  const reworded = valid();
  reworded.steps[0].evidence = [
    { sourceId: "t1", quote: "Strictly follow it as a lofi wireframe" },
  ];
  assert.throws(() => validateSession(reworded, input));
});

test("a node that only repeats the center is dropped before validation", () => {
  const v = valid();
  v.map.center.url = "https://www.hirotos.com/";
  const normalized = normalizeSession(v, input);
  assert.equal(
    normalized.map.nodes.some((n) => n.url === "https://www.hirotos.com/"),
    false,
  );
  assert.doesNotThrow(() => validateSession(normalized, input));
});

test("a typeface node shows its specimen, never a picture", () => {
  const v = valid();
  v.map.nodes[0].font = { family: "Doto", sample: "WELCOME ABOARD" };
  assert.equal(normalizeSession(v, input).map.nodes[0].itemId, null);
});

test("deleted URLs cannot return through earlier transcripts or the saved map", () => {
  const value = valid();
  const removedURL = value.map.nodes.find((n) => n.url).url;
  const source = {
    ...input,
    current: value,
    media: input.media.filter((item) => item.url !== removedURL),
    removedMedia: [{ id: "deleted", url: removedURL }],
  };
  assert.ok(!sessionURLs(source).includes(removedURL));
  assert.throws(
    () => validateSession(value, source),
    /deleted source|unavailable item/,
  );
});

test("deleting a duplicate does not ban a source that is still saved", () => {
  const value = valid();
  const kept = input.media.find((item) => item.url);
  const source = {
    ...input,
    current: value,
    removedMedia: [{ id: "deleted-duplicate", url: kept.url }],
  };
  assert.ok(
    sessionURLs(source).includes(kept.url.replace(/\/$/, "")) ||
      sessionURLs(source).includes(kept.url),
  );
  assert.doesNotThrow(() => validateSession(value, source));
});

test("unavailable private previews keep their evidence but never become picture slots", () => {
  const source = structuredClone(input);
  source.media.find((m) => m.id === "m-sketch").visual = "unavailable";
  const proposed = valid();
  proposed.map.nodes[0].itemId = "m-sketch";
  const evidence = structuredClone(proposed.map.nodes[0].evidence);
  const repaired = normalizeSession(proposed, source);
  assert.deepEqual(
    repaired.steps[0].canvas.items.map((i) => i.itemId),
    ["m-ticket"],
  );
  assert.equal(repaired.steps[0].canvas.layout, "reference");
  assert.equal(repaired.map.nodes[0].itemId, null);
  assert.deepEqual(repaired.map.nodes[0].evidence, evidence);
});

// The hand-written Story and Map saved to the Newron collection (POST /api/stories, action "save").
const curated = () =>
  JSON.parse(readFileSync("examples/newron-story.json", "utf8"));

test("the curated Newron document is valid, stable and ships every picture it names", () => {
  const doc = normalizeCuratedSession(curated());
  assert.equal(doc.curated, true);
  assert.equal(doc.steps.length, 5);
  assert.equal(doc.map.nodes.length, 6);
  assert.deepEqual(normalizeCuratedSession(doc), doc);
  for (const { src } of Object.values(doc.pictures))
    assert.ok(existsSync("public" + src), `${src} is in public/`);
});

test("a curated document fills every optional field, so the renderer reads one form", () => {
  const doc = normalizeCuratedSession(curated());
  const [first, second] = doc.steps;
  assert.deepEqual(first.canvas.said, null);
  assert.deepEqual(first.canvas.wipe, null);
  assert.deepEqual(first.evidence, []);
  assert.equal(second.canvas.wipe.beside, null);
  assert.deepEqual(second.canvas.items, []);
  const backend = doc.map.nodes.find((n) => n.fixes);
  assert.equal(backend.itemId, null);
  assert.equal(backend.details[2].commit, "f333025");
  assert.deepEqual(backend.details[2].evidence, { sourceId: "", quote: "" });
});

test("a curated document must say it is curated", () => {
  const doc = curated();
  delete doc.curated;
  assert.throws(() => normalizeCuratedSession(doc), /needs curated/);
  assert.throws(
    () => normalizeCuratedSession({ ...curated(), curated: "yes" }),
    /curated to true/,
  );
});

test("a curated document rejects fields it does not know, including the server's own copy", () => {
  assert.throws(
    () =>
      normalizeCuratedSession({ ...curated(), replaced: { session: null } }),
    /unknown field: replaced/,
  );
  const doc = curated();
  doc.map.nodes[0].html = "<script>";
  assert.throws(() => normalizeCuratedSession(doc), /unknown field: html/);
});

test("curated pictures are only files this site serves under /story/", () => {
  for (const src of [
    "https://example.com/a.jpg",
    "javascript:alert(1)",
    "/story/../secret.jpg",
    "/api/items/1.jpg",
  ]) {
    const doc = curated();
    doc.pictures["s1-sketch"].src = src;
    assert.throws(() => normalizeCuratedSession(doc), /under \/story\//, src);
  }
});

test("every curated picture reference names a picture in the document", () => {
  const doc = curated();
  doc.steps[1].canvas.wipe.to.itemId = "missing";
  assert.throws(() => normalizeCuratedSession(doc), /document's pictures/);
});

test("a curated canvas holds exactly what its layout draws", () => {
  const wipeless = curated();
  delete wipeless.steps[1].canvas.wipe;
  assert.throws(() => normalizeCuratedSession(wipeless), /layout is wipe/);
  const extra = curated();
  extra.steps[4].canvas.items = [
    { itemId: "s5-note", role: "reference", label: "" },
  ];
  assert.throws(() => normalizeCuratedSession(extra), /items must hold 0 to 0/);
  const both = curated();
  both.steps[4].canvas.rules.rows[0].note.text = "and a line";
  assert.throws(() => normalizeCuratedSession(both), /not both/);
  const words = curated();
  words.steps[0].canvas.words = { form: "line", rows: [] };
  assert.throws(() => normalizeCuratedSession(words), /cannot hold words/);
});

test("curated links are https, and a commit detail links its commit by hash", () => {
  const plain = curated();
  plain.map.center.url = "http://newron.app/";
  assert.throws(() => normalizeCuratedSession(plain), /https address/);
  const unlinked = curated();
  delete unlinked.map.nodes[4].details[0].url;
  assert.throws(() => normalizeCuratedSession(unlinked), /links its commit/);
  const named = curated();
  named.map.nodes[4].details[0].commit = "main";
  assert.throws(() => normalizeCuratedSession(named), /by its hash/);
});

test("a curated tile shows one face", () => {
  const doc = curated();
  doc.map.nodes[5].itemId = "g-why";
  assert.throws(() => normalizeCuratedSession(doc), /one face/);
});
