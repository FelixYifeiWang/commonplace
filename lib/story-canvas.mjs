import { imageSource, mediaPath } from "./media-source.mjs";
import { privatePage } from "./session-media.mjs";
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
  if (layout === "reference")
    return count === 2 ? "duo" : count === 3 ? "set" : "grid";
  if (layout === "before-after") return "pair";
  if (layout === "detour") return "path";
  return count >= 4 ? "grid" : "set";
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
/**
 * @param {any} item
 * @param {{screenshots?: boolean, failedSources?: string[]}} [options]
 */
export function pictureFor(
  item,
  { screenshots = true, failedSources = [] } = {},
) {
  if (
    item.fileKey &&
    item.kind === "image" &&
    !failedSources.includes(mediaPath(item, "file"))
  )
    return {
      src: mediaPath(item, "file"),
      fit: item.sourceRole === "user" ? "ink" : "object",
    };
  const cover = imageSource(item);
  // An artifact link carries the part of the page Nox framed from its local file: the work, shown whole.
  if (item.fileKey && item.kind === "link" && !failedSources.includes(cover))
    return { src: cover, fit: "work" };
  if (item.imageUrl && cover && !failedSources.includes(cover))
    return {
      src: cover,
      fit:
        item.kind === "link"
          ? "page"
          : item.sourceRole === "user"
            ? "ink"
            : "object",
    };
  if (
    screenshots &&
    !failedSources.includes(mediaPath(item, "screenshot")) &&
    item.kind === "link" &&
    item.url &&
    // A private page screenshots as a sign-in page: show the text tile instead.
    !privatePage(item.url) &&
    /^[0-9a-f-]{36}$/.test(item.id)
  )
    return { src: mediaPath(item, "screenshot"), fit: "page" };
  return null;
}

// A link's picture opens its page in a new tab, as a reference does in the Map; an artifact opens the artifact.
export function pageUrl(item) {
  return item?.kind === "link" && /^https?:\/\//i.test(item.url || "")
    ? item.url
    : null;
}

// A wipe shows the dropped picture while its frame sits anywhere from the bottom of the screen up to the middle,
// and switches to the kept one once the frame rises past the middle. Between 40% and 60% of the screen it keeps
// whichever it shows, so a frame that stops near the middle never flickers. Pass the current state, or null on load.
/**
 * @param {{ top: number, height: number }} frame
 * @param {number} viewportHeight
 * @param {boolean | null} [kept]
 */
export function wipeKept({ top, height }, viewportHeight, kept = null) {
  const center = (top + height / 2) / viewportHeight;
  if (center < 0.4) return true;
  if (center > 0.6) return false;
  return kept ?? center < 0.5;
}
