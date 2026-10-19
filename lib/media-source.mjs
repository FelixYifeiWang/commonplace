// Saved media always uses an owner-checked, same-origin URL. This also makes
// browser image fitting work for previews with restrictive cross-origin headers.
export function imageSource(item) {
  if (item.fileKey && item.kind === "image") return `/api/files/${item.id}`;
  if (!item.imageUrl) return null;
  // Demo items have no persisted record to authorize.
  if (!/^[0-9a-f-]{36}$/i.test(item.id)) return item.imageUrl;
  return `/api/images/${item.id}?v=${encodeURIComponent(item.updatedAt || "1")}`;
}
