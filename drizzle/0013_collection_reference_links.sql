CREATE TABLE collection_reference_links (
  token_hash TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX collection_reference_links_expiry ON collection_reference_links(expires_at);
