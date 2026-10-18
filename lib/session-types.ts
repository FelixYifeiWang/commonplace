export type Evidence = { sourceId: string; quote: string };
export type CanvasItem = { itemId: string; role: string; label: string };
export type WordsCanvas = {
  form: "flow" | "change" | "spec" | "line" | "number";
  rows: { label: string; text: string; sourceId: string }[];
};
export type SessionStep = {
  title: string;
  text: string;
  canvas: {
    layout: string;
    items: CanvasItem[];
    // A step with no picture: what happened as a flow, change, spec, line or number.
    words?: WordsCanvas | null;
    // Stories written before the words forms carry one quote instead.
    quote?: { sourceId: string; text: string } | null;
  };
  evidence: Evidence[];
};
export type MapDetail = {
  label: string;
  itemId: string | null;
  url: string | null;
  evidence: Evidence;
};
export type MapNode = MapDetail & {
  kind: string;
  weight: "major" | "normal" | "minor";
  summary: string;
  font: { family: string; sample: string } | null;
  details: MapDetail[];
};
export type SessionDocument = {
  collectionName?: string;
  steps: SessionStep[];
  map: {
    center: { label: string; itemId: string | null; url: string | null };
    nodes: MapNode[];
  };
};
