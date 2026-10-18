CREATE TABLE account_spaces (
  auth_id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
