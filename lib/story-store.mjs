import { emptyCheckpoint } from "./story.mjs";
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
      `SELECT s.* FROM stories s JOIN collections c ON c.id=s.collection_id WHERE s.collection_id=? AND s.owner_id=? AND c.deleted_at IS NULL`,
      [collectionId, ownerId],
    ).first();
    if (!state) return null;
    const beats = await all(
      "SELECT * FROM story_beats WHERE collection_id=? ORDER BY position",
      [collectionId],
    );
    return {
      status: state.status,
      error: state.error,
      pending: state.revision > state.processed_revision,
      updatedAt: state.updated_at,
      beats: beats.map(decodeBeat),
    };
  }
  async function claim() {
    const time = now();
    const row = await stmt(
      `SELECT s.*,c.name AS title FROM stories s JOIN collections c ON c.id=s.collection_id
      WHERE c.deleted_at IS NULL AND s.revision>s.processed_revision AND s.lease_until<? AND s.next_attempt_at<=? ORDER BY s.next_attempt_at,s.updated_at LIMIT 1`,
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
      `SELECT id,title,body,url,kind,source_text AS sourceText,source_turn AS sourceTurn,deleted_at AS deletedAt FROM items WHERE collection_id=? AND deleted_at IS NULL ORDER BY created_at,rowid`,
      [row.collection_id],
    );
    const previous = (
      await all(
        "SELECT * FROM story_beats WHERE collection_id=? ORDER BY position DESC LIMIT 12",
        [row.collection_id],
      )
    )
      .reverse()
      .map(decodeBeat);
    return {
      collectionId: row.collection_id,
      title: row.title,
      lease,
      revision: claimed.revision,
      checkpoint,
      turns: turns.slice(0, 100),
      moreTurns: turns.length > 100,
      items,
      previous,
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
  async function fail(job, message) {
    await stmt(
      `UPDATE stories SET status='error',error=?,lease_token=NULL,lease_until=0,next_attempt_at=? WHERE collection_id=? AND lease_token=?`,
      [message, now() + 300000, job.collectionId, job.lease],
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
  return { get, claim, complete, fail, retry };
}
