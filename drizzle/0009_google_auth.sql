CREATE TABLE auth_user (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_session (
 id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 ip_address TEXT, user_agent TEXT
);
--> statement-breakpoint
CREATE INDEX auth_session_user_idx ON auth_session(user_id);
--> statement-breakpoint
CREATE TABLE auth_account (
 id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 access_token TEXT, refresh_token TEXT, id_token TEXT,
 access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_account_user_idx ON auth_account(user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX auth_account_provider_idx ON auth_account(provider_id,account_id);
--> statement-breakpoint
CREATE TABLE auth_verification (
 id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
--> statement-breakpoint
CREATE TABLE auth_rate_limit (
 id TEXT PRIMARY KEY NOT NULL, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL
);
