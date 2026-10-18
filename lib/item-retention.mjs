export const ITEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const retentionCutoff = (now = Date.now()) =>
  new Date(now - ITEM_RETENTION_MS).toISOString();
export function itemAvailable(item, now = Date.now()) {
  return (
    !!item &&
    (!item.deletedAt || Date.parse(item.deletedAt) + ITEM_RETENTION_MS > now)
  );
}
export function daysToRestore(deletedAt, now = Date.now()) {
  return Math.max(
    0,
    Math.ceil((Date.parse(deletedAt) + ITEM_RETENTION_MS - now) / 86400000),
  );
}
