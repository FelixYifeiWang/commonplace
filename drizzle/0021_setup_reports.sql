CREATE TABLE IF NOT EXISTS setup_reports (
  code_hash TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  reporter TEXT NOT NULL,
  report TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code_hash, reporter)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS setup_reports_created ON setup_reports(created_at);
