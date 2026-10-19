import { createStoryStore } from "./story-store.mjs";
import { isReferenceItem } from "./source-policy.mjs";

// Link access is read-only and scoped to one live collection. Keep this projection
// explicit: workspace/account fields and raw ingestion evidence are never shared.
export function sharedItem(item, collectionId) {
  return {
    id: item.id,
    collectionId,
    sharedCollectionId: collectionId,
    sessionId: null,
    kind: item.kind,
    title: item.title,
    body: item.body,
    url: item.url,
    imageUrl: item.imageUrl,
    groupName: item.groupName,
    fileKey: item.fileKey ? "attached" : null,
    mimeType: item.mimeType,
    embedUrl: item.embedUrl,
    sourceText: "",
    sourceTurn: "",
    sourceRole: item.sourceRole,
    inferred: !!item.inferred,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
const itemColumns = `i.id,i.collection_id AS collectionId,i.owner_id AS ownerId,
  i.kind,i.title,i.body,i.url,i.image_url AS imageUrl,i.group_name AS groupName,
  i.file_key AS fileKey,i.mime_type AS mimeType,i.embed_url AS embedUrl,
  i.source_text AS sourceText,i.source_role AS sourceRole,i.inferred,i.created_at AS createdAt,i.updated_at AS updatedAt`;
export function createSharedCollectionStore(db) {
  const stmt = (sql, args = []) => db.prepare(sql).bind(...args);
  async function collection(id) {
    return stmt(
      "SELECT id,owner_id AS ownerId,name,description,created_at AS createdAt FROM collections WHERE id=? AND deleted_at IS NULL",
      [id],
    ).first();
  }
  async function get(id) {
    const c = await collection(id);
    if (!c) return null;
    const { results } = await stmt(
      `SELECT ${itemColumns} FROM items i WHERE i.collection_id=? AND i.owner_id=? AND i.deleted_at IS NULL ORDER BY i.created_at DESC`,
      [id, c.ownerId],
    ).all();
    return {
      collection: {
        id: c.id,
        name: c.name,
        description: c.description,
        createdAt: c.createdAt,
      },
      items: results.filter(isReferenceItem).map((i) => sharedItem(i, id)),
    };
  }
  async function media(collectionId, itemId) {
    const item = await stmt(
      `SELECT ${itemColumns} FROM items i JOIN collections c ON c.id=i.collection_id AND c.owner_id=i.owner_id WHERE c.id=? AND i.id=? AND c.deleted_at IS NULL AND i.deleted_at IS NULL`,
      [collectionId, itemId],
    ).first();
    return item && isReferenceItem(item) ? item : null;
  }
  async function story(id) {
    const c = await collection(id);
    if (!c) return null;
    const s = await createStoryStore(db).get(id, c.ownerId);
    return {
      session: s?.session || null,
      previewSession: s?.previewSession || null,
      preview: !!s?.preview,
      pending: !!s?.pending,
      enabled: true,
      status: s?.status || "pending",
      error: null,
      beats: (s?.beats || []).map((b) => ({
        id: b.id,
        position: b.position,
        title: b.title,
        text: b.text,
        connections: b.connections,
        evidence: b.evidence,
      })),
    };
  }
  return { get, media, story };
}
