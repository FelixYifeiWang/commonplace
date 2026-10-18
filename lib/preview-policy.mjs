export const PREVIEW_VERSION = 2;
// Older title-only previews deserve one attempt with the improved image parser.
export function needsPreview(item) {
  return (
    !!item.url &&
    !item.fileKey &&
    (item.previewStatus === "pending" ||
      (!item.imageUrl && (item.previewVersion || 0) < PREVIEW_VERSION))
  );
}
