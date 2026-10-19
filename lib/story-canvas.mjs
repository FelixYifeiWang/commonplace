import { imageSource } from "./media-source.mjs";
// How a Story canvas is drawn (see STORY_CANVAS.md, "Layouts and variants" and "Fitting images").
// Pure functions, so the rules are tested without a browser.

// The model picks the layout; the renderer picks the variant from how many pictures it can show.
// A layout whose pictures are missing falls back to fewer slots, never an empty one.
export function canvasVariant(layout, count) {
  if (layout === "none" || count === 0) return null;
  if (count === 1) return "full";
  if (layout === "choice")
    return count === 2 ? "duo" : count === 3 ? "hero" : "grid";
  // Two references share the canvas equally; a lead with a column beside it needs three.
  if (layout === "reference") return count === 2 ? "duo" : "set";
  if (layout === "before-after") return "pair";
  if (layout === "detour") return "path";
  return "set";
}

// The picked option leads; a detour reads start, attempts, result; a change reads before, after.
const ORDER = {
  picked: 0,
  start: 0,
  before: 0,
  option: 1,
  attempt: 1,
  after: 1,
  result: 2,
  reference: 1,
};
export function orderItems(items) {
  return [...items].sort((a, b) => (ORDER[a.role] ?? 1) - (ORDER[b.role] ?? 1));
}

// page: a screenshot that may be cropped from the top. object: shown whole. ink: something the human added,
// usually a sketch, blended into the sheet so its paper disappears. null: no picture, so a text tile.
export function pictureFor(item, { screenshots = true } = {}) {
  if (item.fileKey && item.kind === "image")
    return {
      src: `/api/files/${item.id}`,
      fit: item.sourceRole === "user" ? "ink" : "object",
    };
  if (item.imageUrl)
    return {
      src: imageSource(item),
      fit:
        item.kind === "link"
          ? "page"
          : item.sourceRole === "user"
            ? "ink"
            : "object",
    };
  if (
    screenshots &&
    item.kind === "link" &&
    item.url &&
    /^[0-9a-f-]{36}$/.test(item.id)
  )
    return { src: `/api/screenshots/${item.id}?v=2`, fit: "page" };
  return null;
}
