import { sourcePreview } from "./session-recovery.mjs";
import { emptyCheckpoint, publicStoryError } from "./story.mjs";
const decodeBeat = (b) => ({
  ...b,
  connections: JSON.parse(b.connections),
  evidence: JSON.parse(b.evidence),
});
// D1 prepared statements, also exercised against a real SQLite database in tests.
export function createStoryStore(
  db,
  { now = Date.now, uuid = () => crypto.randomUUID() } = {},
) {
  const stmt = (sql, args = []) => db.prepare(sql).bind(...args);
  const all = async (sql, args) => (await stmt(sql, args).all()).results;
  async function get(collectionId, ownerId) {
    const state = await stmt(
      `SELECT s.*,c.name AS title FROM stories s JOIN collections c ON c.id=s.collection_id WHERE s.collection_id=? AND s.owner_id=? AND c.deleted_at IS NULL`,
      [collectionId, ownerId],
    ).first();
    if (!state) return null;
    const beats = await all(
      "SELECT * FROM story_beats WHERE collection_id=? ORDER BY position",
      [collectionId],
    );
    let session = state.session_json ? JSON.parse(state.session_json) : null;
    let preview = false;
    if (!session) {
      const [turns, items] = await Promise.all([
        all(
          `SELECT t.id,t.role,substr(t.body,1,8000) AS body FROM turns t JOIN sessions s ON s.id=t.session_id WHERE s.collection_id=? AND s.owner_id=? AND t.role='user' ORDER BY t.rowid LIMIT 32`,
          [collectionId, ownerId],
        ),
        all(
          `SELECT id,title,body,url,kind,source_role AS sourceRole,image_url AS imageUrl,file_key AS fileKey FROM items WHERE collection_id=? AND owner_id=? AND deleted_at IS NULL ORDER BY CASE WHEN image_url IS NOT NULL THEN 0 ELSE 1 END,created_at LIMIT 64`,
          [collectionId, ownerId],
        ),
      ]);
      session = sourcePreview(state.title, turns, items);
      preview = !!session;
    }
    return {
      preview,
      status: state.status,
      error: publicStoryError(state.error),
      pending: state.revision > state.processed_revision,
      updatedAt: state.updated_at,
      beats: beats.map(decodeBeat),
      session,
    };
  }
  async function claim() {
    const time = now();
    const row = await stmt(
      `SELECT s.*,c.name AS title FROM stories s JOIN collections c ON c.id=s.collection_id
      WHERE c.deleted_at IS NULL AND s.status!='error' AND s.revision>s.processed_revision AND s.lease_until<? AND s.next_attempt_at<=? ORDER BY s.next_attempt_at,s.updated_at LIMIT 1`,
      [time, time],
    ).first();
    if (!row) return null;
    const lease = uuid();
    const claimed = await stmt(
      `UPDATE stories SET lease_token=?,lease_until=?,status='generating',error=NULL WHERE collection_id=? AND lease_until<? RETURNING *`,
      [lease, time + 180000, row.collection_id, time],
    ).first();
    if (!claimed) return null;
    const checkpoint = {
      ...emptyCheckpoint(),
      ...JSON.parse(claimed.checkpoint),
    };
    const turns = await all(
      `SELECT t.rowid AS sequence,t.id,t.role,t.body FROM turns t JOIN sessions s ON s.id=t.session_id WHERE s.collection_id=? AND t.rowid>=? ORDER BY t.rowid LIMIT 101`,
      [row.collection_id, checkpoint.turnSequence],
    );
    const items = await all(
      `SELECT id,title,body,url,kind,source_text AS sourceText,source_turn AS sourceTurn,source_role AS sourceRole,deleted_at AS deletedAt FROM items WHERE collection_id=? ORDER BY created_at,rowid`,
      [row.collection_id],
    );
    const current = claimed.session_json
      ? JSON.parse(claimed.session_json)
      : null;
    const historyIds = [
      ...new Set(
        [
          ...(current?.steps || []).flatMap((s) => [
            ...(s.evidence || []).map((e) => e.sourceId),
            s.canvas?.quote?.sourceId,
            ...(s.canvas?.words?.rows || []).map((r) => r.sourceId),
          ]),
          ...(current?.map?.nodes || []).flatMap((n) => [
            n.evidence?.sourceId,
            ...(n.details || []).map((d) => d.evidence?.sourceId),
          ]),
        ].filter(Boolean),
      ),
    ];
    const history = historyIds.length
      ? await all(
          `SELECT t.rowid AS sequence,t.id,t.role,t.body FROM turns t JOIN sessions s ON s.id=t.session_id WHERE s.collection_id=? AND t.id IN (${historyIds.map(() => "?").join(",")})`,
          [row.collection_id, ...historyIds],
        )
      : [];
    const previous = (
      await all(
        "SELECT * FROM story_beats WHERE collection_id=? ORDER BY position DESC LIMIT 12",
        [row.collection_id],
      )
    )
      .reverse()
      .map(decodeBeat);
    return {
      visualRefresh: !!claimed.visual_refresh,
      collectionId: row.collection_id,
      title: row.title,
      lease,
      revision: claimed.revision,
      checkpoint,
      turns: turns.slice(0, 100),
      moreTurns: turns.length > 100,
      items,
      previous,
      current,
      history,
    };
  }
  async function complete(job, batch, beats, model) {
    const time = now(),
      date = new Date(time).toISOString();
    // Every insert and the checkpoint are guarded by the same lease, atomically.
    const guard = `EXISTS(SELECT 1 FROM stories s JOIN collections c ON c.id=s.collection_id WHERE s.collection_id=? AND s.lease_token=? AND s.lease_until>? AND c.deleted_at IS NULL)`;
    const statements = beats.map((beat) =>
      stmt(
        `INSERT INTO story_beats(id,collection_id,position,title,text,connections,evidence,model,created_at)
      SELECT ?,?,COALESCE((SELECT MAX(position)+1 FROM story_beats WHERE collection_id=?),1),?,?,?,?,?,? WHERE ${guard}`,
        [
          uuid(),
          job.collectionId,
          job.collectionId,
          beat.title,
          beat.text,
          JSON.stringify(beat.connections),
          JSON.stringify(beat.evidence),
          model,
          date,
          job.collectionId,
          job.lease,
          time,
        ],
      ),
    );
    statements.push(
      stmt(
        `UPDATE stories SET checkpoint=?,processed_revision=CASE WHEN ? THEN processed_revision ELSE ? END,
      status=CASE WHEN ? OR revision>? THEN 'pending' ELSE 'ready' END,lease_token=NULL,lease_until=0,error=NULL,updated_at=?,next_attempt_at=?
      WHERE collection_id=? AND lease_token=? AND lease_until>? AND ${guard}`,
        [
          JSON.stringify(batch.checkpoint),
          batch.hasMore ? 1 : 0,
          job.revision,
          batch.hasMore ? 1 : 0,
          job.revision,
          date,
          time + 1000,
          job.collectionId,
          job.lease,
          time,
          job.collectionId,
          job.lease,
          time,
        ],
      ),
    );
    const result = await db.batch(statements);
    return result.at(-1).meta.changes === 1;
  }
  async function completeSession(job, batch, session, model) {
    const time = now();
    const statements = [];
    if (session?.collectionName)
      statements.push(
        stmt(
          `UPDATE collections SET name=? WHERE id=? AND deleted_at IS NULL
       AND EXISTS(SELECT 1 FROM sessions WHERE collection_id=collections.id AND owner_id=collections.owner_id)
       AND EXISTS(SELECT 1 FROM stories WHERE collection_id=collections.id AND lease_token=? AND lease_until>?)`,
          [session.collectionName, job.collectionId, job.lease, time],
        ),
      );
    statements.push(
      stmt(
        `UPDATE stories SET visual_refresh=CASE WHEN ? THEN visual_refresh ELSE 0 END, session_json=COALESCE(?,session_json),session_model=?,checkpoint=?,
      processed_revision=CASE WHEN ? THEN processed_revision ELSE ? END,
      status=CASE WHEN ? OR revision>? THEN 'pending' ELSE 'ready' END,
      lease_token=NULL,lease_until=0,error=NULL,updated_at=?,next_attempt_at=?
      WHERE collection_id=? AND lease_token=? AND lease_until>?
      AND EXISTS(SELECT 1 FROM collections WHERE id=? AND deleted_at IS NULL)`,
        [
          batch.hasMore ? 1 : 0,
          session ? JSON.stringify(session) : null,
          model,
          JSON.stringify(batch.checkpoint),
          batch.hasMore ? 1 : 0,
          job.revision,
          batch.hasMore ? 1 : 0,
          job.revision,
          new Date(time).toISOString(),
          time + 1000,
          job.collectionId,
          job.lease,
          time,
          job.collectionId,
        ],
      ),
    );
    const result = await db.batch(statements);
    return result.at(-1).meta.changes === 1;
  }
  async function fail(job, error) {
    const message =
      error instanceof Error ? error.diagnostic || error.message : error;
    const partial =
      error instanceof Error && error.partial
        ? JSON.stringify(error.partial)
        : null;
    await stmt(
      `UPDATE stories SET status='error',error=?,session_json=COALESCE(session_json,?),lease_token=NULL,lease_until=0,next_attempt_at=? WHERE collection_id=? AND lease_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM collections WHERE id=? AND deleted_at IS NULL)`,
      [
        message,
        partial,
        now() + 300000,
        job.collectionId,
        job.lease,
        now(),
        job.collectionId,
      ],
    ).run();
  }
  async function retry(collectionId, ownerId) {
    return (
      await stmt(
        `UPDATE stories SET next_attempt_at=0,status='pending',error=NULL WHERE collection_id=? AND owner_id=? AND status='error' AND EXISTS(SELECT 1 FROM collections WHERE id=? AND deleted_at IS NULL)`,
        [collectionId, ownerId, collectionId],
      ).run()
    ).meta.changes;
  }
  return { get, claim, complete, completeSession, fail, retry };
}
