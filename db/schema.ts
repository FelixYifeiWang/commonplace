import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
  lastSeen: text("last_seen"),
  createdAt: text("created_at").notNull(),
});
export const collections = sqliteTable("collections", {
  frozenAt: text("frozen_at"),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  mode: text("mode").notNull().default("follow"),
  state: text("state").notNull().default("waiting"),
  tokenHash: text("token_hash").notNull(),
  deviceId: text("device_id").references(() => devices.id),
  externalId: text("external_id"),
  lastSeen: text("last_seen"),
  createdAt: text("created_at").notNull(),
});
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    sessionId: text("session_id").references(() => sessions.id),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id),
    identity: text("identity").notNull(),
    deletedAt: text("deleted_at"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url"),
    imageUrl: text("image_url"),
    groupName: text("group_name").notNull().default(""),
    fileKey: text("file_key"),
    previewStatus: text("preview_status").notNull().default("pending"),
    previewVersion: integer("preview_version").notNull().default(0),
    mimeType: text("mime_type"),
    embedUrl: text("embed_url"),
    sourceText: text("source_text").notNull(),
    sourceRole: text("source_role").notNull(),
    sourceTurn: text("source_turn").notNull().default(""),
    inferred: integer("inferred", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("items_session_identity").on(table.sessionId, table.identity),
  ],
);
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    ownerId: text("owner_id").notNull(),
    externalId: text("external_id").notNull(),
    role: text("role").notNull(),
    body: text("body").notNull(),
    digestStatus: text("digest_status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("turns_session_external").on(table.sessionId, table.externalId),
  ],
);

export const stories = sqliteTable("stories", {
  visualRefresh: integer("visual_refresh", { mode: "boolean" })
    .notNull()
    .default(false),
  collectionId: text("collection_id")
    .primaryKey()
    .references(() => collections.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  revision: integer("revision").notNull().default(1),
  processedRevision: integer("processed_revision").notNull().default(0),
  checkpoint: text("checkpoint").notNull().default("{}"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
export const storyBeats = sqliteTable(
  "story_beats",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    connections: text("connections").notNull(),
    evidence: text("evidence").notNull(),
    model: text("model").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("story_beats_order").on(table.collectionId, table.position),
  ],
);

export const pairingCodes = sqliteTable("pairing_codes", {
  codeHash: text("code_hash").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  claimId: text("claim_id"),
  readyAt: integer("ready_at"),
});

export const accountSpaces = sqliteTable("account_spaces", {
  authId: text("auth_id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export * from "./auth-schema";

export const collectionReferenceLinks = sqliteTable(
  "collection_reference_links",
  {
    tokenHash: text("token_hash").primaryKey(),
    ownerId: text("owner_id").notNull(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("collection_reference_links_expiry").on(table.expiresAt)],
);
