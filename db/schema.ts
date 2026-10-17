import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
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
