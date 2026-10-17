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
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url"),
    imageUrl: text("image_url"),
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
