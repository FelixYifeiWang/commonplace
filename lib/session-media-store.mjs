import { captureTransaction } from "./capture-transaction.mjs";
// Saves pictures the companion found in a session (see lib/session-media.mjs): a pasted image becomes the
// human's own image item; an artifact capture becomes the picture of that artifact's link.
import { itemIdentity } from "./protocol.mjs";

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
async function sha256(data) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createSessionMediaStore(
  db,
  { put, now = () => new Date().toISOString(), id = () => crypto.randomUUID() },
) {
  // The same identity /api/capture gives a link found in the conversation, so a capture finds its link.
  const linkIdentity = (url) => sha256(itemIdentity({ url }));
  const find = (session, identity) =>
    db
      .prepare("SELECT id FROM items WHERE session_id=? AND identity=?")
      .bind(session.id, identity)
      .first();
  const store = (session, upload) =>
    put({
      ownerId: session.ownerId,
      name: `${upload.kind === "pasted" ? "pasted" : "capture"}.${EXT[upload.mimeType]}`,
      mimeType: upload.mimeType,
      bytes: upload.bytes,
    });
  const suppressed = (session, identity) =>
    db
      .prepare(
        "SELECT 1 FROM item_suppressions WHERE owner_id=? AND session_id=? AND identity=?",
      )
      .bind(session.ownerId, session.id, identity)
      .first();
  const commit = async (session, statement, at, key) => {
    try {
      return await captureTransaction(db, session, [
        statement,
        db
          .prepare(
            `UPDATE stories SET visual_refresh=1,revision=revision+1,status=CASE WHEN status='generating' THEN status ELSE 'pending' END,next_attempt_at=? WHERE collection_id=?`,
          )
          .bind(Date.parse(at) + 8000, session.collectionId),
      ]);
    } finally {
      // A delete, pause, duplicate or disconnect can win while storage uploads.
      // Keep an unreferenced upload in the same durable cleanup queue.
      await db
        .prepare(
          `INSERT INTO blob_deletions(file_key,owner_id,not_before)
        SELECT ?,?,0 WHERE NOT EXISTS(SELECT 1 FROM items WHERE file_key=?) ON CONFLICT(file_key) DO NOTHING`,
        )
        .bind(key, session.ownerId, key)
        .run();
    }
  };
  return {
    linkIdentity,
    async save(session, upload) {
      const at = now();
      if (upload.kind === "pasted") {
        // Pasting the same image twice keeps one item.
        const identity = await sha256(`pasted:${await sha256(upload.bytes)}`);
        if (await suppressed(session, identity)) return { suppressed: true };
        const existing = await find(session, identity);
        if (existing) return { itemId: existing.id, duplicate: true };
        const key = await store(session, upload);
        const itemId = id();
        await commit(
          session,
          db
            .prepare(
              `INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,body,url,image_url,file_key,mime_type,preview_status,source_text,source_role,source_turn,inferred,created_at,updated_at)
             VALUES(?,?,?,?,?,'image','Pasted image','',NULL,NULL,?,?,'ready',?,'user',?,0,?,?)
             ON CONFLICT(session_id,identity) DO NOTHING`,
            )
            .bind(
              itemId,
              session.ownerId,
              session.id,
              session.collectionId,
              identity,
              key,
              upload.mimeType,
              upload.context,
              upload.turnId,
              at,
              at,
            ),
          at,
          key,
        );
        return { itemId };
      }
      const identity = await linkIdentity(upload.url);
      if (await suppressed(session, identity)) return { suppressed: true };
      const existing = await find(session, identity);
      const key = await store(session, upload);
      if (existing) {
        // The page's own title beats one derived from its address or claude.ai's generic preview title.
        const slug = upload.url.split("/").pop();
        await commit(
          session,
          db
            .prepare(
              `UPDATE items SET file_key=?, mime_type=?, image_url=NULL, preview_status='ready', updated_at=?,
             title=CASE WHEN ?<>'' AND title IN (?,'Claude','Claude Artifact','') THEN ? ELSE title END
             WHERE id=? AND owner_id=?`,
            )
            .bind(
              key,
              upload.mimeType,
              at,
              upload.title,
              slug,
              upload.title,
              existing.id,
              session.ownerId,
            ),
          at,
          key,
        );
        return { itemId: existing.id };
      }
      const itemId = id();
      await commit(
        session,
        db
          .prepare(
            `INSERT INTO items(id,owner_id,session_id,collection_id,identity,kind,title,body,url,image_url,file_key,mime_type,preview_status,source_text,source_role,source_turn,inferred,created_at,updated_at)
           VALUES(?,?,?,?,?,'link',?,'',?,NULL,?,?,'ready',?,'assistant',?,0,?,?)
           ON CONFLICT(session_id,identity) DO NOTHING`,
          )
          .bind(
            itemId,
            session.ownerId,
            session.id,
            session.collectionId,
            identity,
            upload.title || "Claude artifact",
            upload.url,
            key,
            upload.mimeType,
            upload.context,
            upload.turnId,
            at,
            at,
          ),
        at,
        key,
      );
      return { itemId };
    },
  };
}
