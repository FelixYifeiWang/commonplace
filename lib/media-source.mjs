// Saved media uses an authorized, same-origin URL. This also makes
// browser image fitting work for previews with restrictive cross-origin headers.
export function imageSource(item) {
  if (item.fileKey && item.kind === "image") return mediaPath(item, "file");
  if (!item.imageUrl) return null;
  // Demo items have no persisted record to authorize.
  if (!/^[0-9a-f-]{36}$/i.test(item.id)) return item.imageUrl;
  return mediaPath(item, "image");
}

export function mediaPath(item, kind) {
  const suffix =
    kind === "image"
      ? `?v=${encodeURIComponent(item.updatedAt || "1")}`
      : kind === "screenshot"
        ? "?v=2"
        : "";
  const base = item.sharedCollectionId
    ? `/api/shared/${encodeURIComponent(item.sharedCollectionId)}/media/${encodeURIComponent(item.id)}/${kind}`
    : `/api/${{ image: "images", file: "files", screenshot: "screenshots" }[kind]}/${item.id}`;
  return base + suffix;
}
