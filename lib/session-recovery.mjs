import {
  cleanSessionText,
  isSessionNoise,
  redactStoryText,
  normalizeSession,
  validateSession,
} from "./story.mjs";
import { curateGalleryItems } from "./gallery.mjs";

// The model chooses an ID. Only this server-side catalog supplies quote text.
export function excerptCatalog(input) {
  const sources = [
    ...input.transcript.map((t) => ({ id: t.id, text: t.text })),
    ...input.media.map((i) => ({
      id: i.id,
      text: [i.title, i.note, i.context].filter(Boolean).join("\n"),
    })),
  ];
  const previous = [
    ...(input.current?.steps || []).flatMap((s) => s.evidence || []),
    ...(input.current?.map?.nodes || []).flatMap((n) => [
      n.evidence,
      ...(n.details || []).map((d) => d.evidence),
    ]),
  ].filter(Boolean);
  const result = [];
  for (const source of sources) {
    const text = String(source.text || "");
    const lines = text
      .split(/\n+|(?<=[.!?。！？])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const candidates = [
      ...previous.filter((e) => e.sourceId === source.id).map((e) => e.quote),
      ...lines.slice(0, 12),
      ...lines.slice(-4),
    ];
    const seen = new Set();
    for (const candidate of candidates) {
      let quote = candidate.slice(0, 170);
      if (candidate.length > 170 && quote.lastIndexOf(" ") > 80)
        quote = quote.slice(0, quote.lastIndexOf(" "));
      if (
        !quote ||
        seen.has(quote) ||
        !text.includes(quote) ||
        redactStoryText(quote) !== quote
      )
        continue;
      seen.add(quote);
      result.push({ id: `e${result.length}`, sourceId: source.id, quote });
    }
  }
  return result;
}

export function hydrateEvidence(value, catalog) {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const hydrate = (e) => {
    // Existing stored documents and locally validated drafts retain their format.
    if (!e || !("excerptId" in e)) return e;
    const source = byId.get(e.excerptId);
    if (!source)
      throw new Error(
        "Unknown evidence excerpt. Choose an ID from the excerpt catalog.",
      );
    return { sourceId: source.sourceId, quote: source.quote };
  };
  const result = structuredClone(value);
  for (const step of result.steps || [])
    step.evidence = (step.evidence || []).map(hydrate);
  for (const node of result.map?.nodes || []) {
    node.evidence = hydrate(node.evidence);
    for (const detail of node.details || [])
      detail.evidence = hydrate(detail.evidence);
  }
  return result;
}

// Validate progressively. Optional presentation can be removed, but evidence,
// source ownership, URL allowlists and item identity always use the same validator.
export function recoverSession(value, input) {
  let normalized;
  try {
    normalized = normalizeSession(value, input);
  } catch {
    return null;
  }
  let result;
  try {
    result = validateSession(
      { ...normalized, steps: [], map: { ...normalized.map, nodes: [] } },
      input,
      { strictPresentation: false },
    );
  } catch {
    return null;
  }
  const accept = (draft) => {
    try {
      result = validateSession(draft, input, { strictPresentation: false });
      return true;
    } catch {
      return false;
    }
  };
  for (const step of normalized.steps || []) {
    if (accept({ ...result, steps: [...result.steps, step] })) continue;
    const seen = new Set();
    const references = (step.canvas?.items || [])
      .flatMap((item) => {
        const media = input.media.find((m) => m.id === item.itemId);
        if (!media || seen.has(media.id)) return [];
        seen.add(media.id);
        return [{ itemId: media.id, role: "reference", label: "Saved source" }];
      })
      .slice(0, 4);
    accept({
      ...result,
      steps: [
        ...result.steps,
        {
          ...step,
          canvas: {
            layout: references.length ? "reference" : "none",
            items: references,
            words: null,
          },
        },
      ],
    });
  }
  for (const node of normalized.map?.nodes || []) {
    const base = { ...node, details: [] };
    if (
      !accept({
        ...result,
        map: { ...result.map, nodes: [...result.map.nodes, base] },
      })
    )
      continue;
    for (const detail of node.details || []) {
      const nodes = structuredClone(result.map.nodes);
      nodes.at(-1).details.push(detail);
      accept({ ...result, map: { ...result.map, nodes } });
    }
  }
  return result.steps.length || result.map.nodes.length ? result : null;
}

const clip = (value, max) =>
  redactStoryText(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
// A read-only first view, not a generated narrative or a generation checkpoint.
// Every word comes from the collection. No inferred relationships or decisions.
export function sourcePreview(name, turns, items) {
  const excerpts = turns
    .filter((t) => t.role === "user")
    .map((t) => ({ id: t.id, text: redactStoryText(cleanSessionText(t.body)) }))
    .filter((t) => t.text && !isSessionNoise(t.text))
    .slice(0, 3);
  const media = curateGalleryItems(items.filter((i) => !i.deletedAt)).slice(
    0,
    6,
  );
  if (!excerpts.length && !media.length) return null;
  const steps = excerpts.map((t, index) => ({
    title: index === 0 ? "Starting point" : `Session excerpt ${index + 1}`,
    text: clip(t.text, 320),
    canvas: {
      layout: media.length && index === 0 ? "reference" : "none",
      items:
        index === 0
          ? media.slice(0, 4).map((i) => ({
              itemId: i.id,
              role: "reference",
              label: clip(i.title, 40) || "Saved source",
            }))
          : [],
      words: null,
    },
    evidence: [{ sourceId: t.id, quote: clip(t.text, 170) }],
  }));
  if (!steps.length)
    steps.push({
      title: "Saved sources",
      text: media.map((i) => clip(i.title, 60)).join(" · "),
      canvas: {
        layout: "reference",
        items: media.slice(0, 4).map((i) => ({
          itemId: i.id,
          role: "reference",
          label: clip(i.title, 40) || "Saved source",
        })),
        words: null,
      },
      evidence: [],
    });
  const nodes = media.map((i) => ({
    label: clip(i.title, 32) || "Saved source",
    summary: clip(i.body || i.title, 80) || "Saved source",
    kind: "reference",
    weight: "normal",
    font: null,
    itemId: i.id,
    url: null,
    evidence: { sourceId: i.id, quote: clip(i.title || i.body, 170) },
    details: [],
  }));
  if (!nodes.length)
    for (const [index, t] of excerpts.entries())
      nodes.push({
        label: `Thought ${index + 1}`,
        summary: clip(t.text, 80),
        kind: "idea",
        weight: "normal",
        font: null,
        itemId: null,
        url: null,
        evidence: { sourceId: t.id, quote: clip(t.text, 170) },
        details: [],
      });
  return {
    steps,
    map: {
      center: { label: clip(name, 60) || "Untitled", itemId: null, url: null },
      nodes,
    },
  };
}
