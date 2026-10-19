// Authorization and writes share one transaction. A pause/delete committed first
// rejects the whole batch; retries keep their cursor and deduplicate prior batches.
export function captureCheck(db, session) {
  return db
    .prepare("INSERT INTO capture_checks(session_id,owner_id) VALUES(?,?)")
    .bind(session.id, session.ownerId);
}
export function clearCaptureCheck(db, session) {
  return db
    .prepare("DELETE FROM capture_checks WHERE session_id=?")
    .bind(session.id);
}
export function captureUnavailable(error) {
  for (let depth = 0; error && depth < 5; depth++, error = error.cause) {
    if (/CAPTURE_UNAVAILABLE/.test(String(error.message || error))) return true;
  }
  return false;
}
export async function captureTransaction(db, session, statements) {
  return db.batch([
    captureCheck(db, session),
    ...statements,
    clearCaptureCheck(db, session),
  ]);
}
