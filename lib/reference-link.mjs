export const REFERENCE_LINK_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export const referenceLinkQuery = `
SELECT l.owner_id AS ownerId, c.id, c.name, c.description
FROM collection_reference_links l
JOIN collections c ON c.id = l.collection_id AND c.owner_id = l.owner_id
JOIN devices d ON d.id = l.device_id AND d.owner_id = l.owner_id
WHERE l.token_hash = ? AND l.expires_at > ?
  AND d.revoked = 0 AND c.deleted_at IS NULL AND c.favorite = 1
LIMIT 1`;
export function referencePrompt(origin, token) {
  return `Use ${origin}/r/${token}.md as reference for this task.`;
}
