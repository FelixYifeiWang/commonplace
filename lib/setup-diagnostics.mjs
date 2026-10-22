// Diagnostics are untrusted agent input. Only keep explicit, bounded fields.
export function sanitizeSetupReport(input) {
  if (!input || !["installer", "agent"].includes(input.reporter))
    throw new Error("Invalid setup report.");
  const clean = (value, limit) =>
    String(value ?? "")
      .slice(0, 16000)
      .replace(/https?:\/\/[^\s"<>]+/gi, (value) => {
        try {
          const url = new URL(value);
          return url.origin + url.pathname;
        } catch {
          return "[URL]";
        }
      })
      .replace(/\b(?:sk-[\w-]+|[a-f0-9]{64})\b/gi, "[credential]")
      .replace(/\bBearer\s+[^\s"<>]+/gi, "Bearer [credential]")
      .replace(
        /\b(?:[\w-]*(?:token|secret|password|api[_-]?key))\s*[:=]\s*[^\s,;]+/gi,
        "[credential]",
      )
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(/\/(?:Users|home)\/[^\s/"']+/g, "~")
      .slice(0, limit);
  return {
    reporter: input.reporter,
    stage: clean(input.stage, 120),
    environment: clean(input.environment, 1000),
    evidence: clean(input.evidence, 6000),
    rootCause: clean(input.rootCause, 2000),
    confidence: ["confirmed", "likely", "unknown"].includes(input.confidence)
      ? input.confidence
      : "unknown",
    suggestedFix: clean(input.suggestedFix, 2000),
  };
}
export async function storeSetupReport(db, codeHash, report, now = Date.now()) {
  // One immutable report per reporter per code. Does not claim or complete setup.
  await db
    .prepare("DELETE FROM setup_reports WHERE created_at<?")
    .bind(now - 30 * 24 * 60 * 60 * 1000)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO setup_reports(code_hash,owner_id,reporter,report,created_at)
    SELECT code_hash,owner_id,?,?,? FROM pairing_codes WHERE code_hash=? AND expires_at>?`,
    )
    .bind(report.reporter, JSON.stringify(report), now, codeHash, now)
    .run();
  const result = await db
    .prepare(
      "UPDATE setup_reports SET created_at=created_at WHERE code_hash=? AND reporter=? AND EXISTS(SELECT 1 FROM pairing_codes WHERE code_hash=? AND expires_at>?)",
    )
    .bind(codeHash, report.reporter, codeHash, now)
    .run();
  return result.meta.changes === 1;
}
