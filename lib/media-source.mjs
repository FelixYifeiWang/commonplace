import { privatePage } from "./session-media.mjs";
// Saved media uses an authorized, same-origin URL. This also makes
// browser image fitting work for previews with restrictive cross-origin headers.
export function imageSource(item) {
  if (item.fileKey && item.kind === "image") return mediaPath(item, "file");
  // A link's file is its captured page (an artifact rendered by the companion); it changes on re-capture.
  if (item.fileKey && item.kind === "link")
    return `${mediaPath(item, "file")}?v=${encodeURIComponent(item.updatedAt || "1")}`;
  // A private page's public cover is the site's default card, never the page itself.
  if (!item.imageUrl || (item.kind === "link" && privatePage(item.url)))
    return null;
  // Demo items have no persisted record to authorize.
  if (!/^[0-9a-f-]{36}$/i.test(item.id)) return item.imageUrl;
  return mediaPath(item, "image");
}

export function mediaPath(item, kind) {
  const suffix =
    kind === "image"
      ? `?v=${encodeURIComponent(item.updatedAt || "1")}&p=2`
      : kind === "screenshot"
        ? "?v=3"
        : "";
  const base = item.sharedCollectionId
    ? `/api/shared/${encodeURIComponent(item.sharedCollectionId)}/media/${encodeURIComponent(item.id)}/${kind}`
    : `/api/${{ image: "images", file: "files", screenshot: "screenshots" }[kind]}/${item.id}`;
  return base + suffix;
}
