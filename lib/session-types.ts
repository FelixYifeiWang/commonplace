export type Evidence = { sourceId: string; quote: string };
export type CanvasItem = { itemId: string; role: string; label: string };
export type WordsCanvas = {
  form: "flow" | "change" | "spec" | "line" | "number";
  rows: { label: string; text: string; sourceId: string }[];
};
// A picture a curated document ships under public/story/, fitted as the document says.
export type CuratedPicture = {
  src: string;
  fit: "page" | "ink" | "object";
  ar: number | null;
  focus: string | null;
  alt: string;
};
export type ShownPicture = { itemId: string; label: string };
export type SessionStep = {
  title: string;
  text: string;
  // Curated documents only.
  date?: string;
  canvas: {
    layout: string;
    items: CanvasItem[];
    // A step with no picture: what happened as a flow, change, spec, line or number.
    words?: WordsCanvas | null;
    // Stories written before the words forms carry one quote instead.
    quote?: { sourceId: string; text: string } | null;
    // Curated documents only: the human's words at the foot of the canvas, a scroll-driven wipe from the dropped
    // picture to the kept one, and notes beside the rules they became (lib/story.mjs, normalizeCuratedSession).
    said?: { text: string; by: string } | null;
    wipe?: {
      from: ShownPicture;
      to: ShownPicture;
      beside: ShownPicture | null;
      alt: string;
    } | null;
    rules?: {
      heads: string[];
      rows: { note: { itemId: string | null; text: string }; rule: string }[];
    } | null;
  };
  evidence: Evidence[];
};
export type MapDetail = {
  label: string;
  itemId: string | null;
  url: string | null;
  evidence: Evidence;
  // Curated documents only: the commit a fix shipped in.
  commit?: string | null;
};
export type MapNode = MapDetail & {
  kind: string;
  weight: "major" | "normal" | "minor";
  summary: string;
  font: { family: string; sample: string } | null;
  // Curated documents only: a short principle in large type, or problems and their fixes.
  say?: string | null;
  fixes?: [string, string][] | null;
  details: MapDetail[];
};
export type SessionDocument = {
  collectionName?: string;
  // A curated document is written by hand; its pictures are static files, not collection items.
  curated?: boolean;
  pictures?: Record<string, CuratedPicture>;
  steps: SessionStep[];
  map: {
    center: { label: string; itemId: string | null; url: string | null };
    nodes: MapNode[];
  };
};
