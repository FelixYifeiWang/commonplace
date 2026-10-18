export type Evidence = { sourceId: string; quote: string };
export type CanvasItem = { itemId: string; role: string; label: string };
export type SessionStep = {
  title: string;
  text: string;
  canvas: {
    layout: string;
    items: CanvasItem[];
    quote: { sourceId: string; text: string } | null;
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
  steps: SessionStep[];
  map: {
    center: { label: string; itemId: string | null; url: string | null };
    nodes: MapNode[];
  };
};
