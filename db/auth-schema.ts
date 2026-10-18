import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
const date = (name: string) => integer(name, { mode: "timestamp_ms" });
export const user = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: date("created_at").notNull(),
  updatedAt: date("updated_at").notNull(),
});
export const session = sqliteTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: date("expires_at").notNull(),
    createdAt: date("created_at").notNull(),
    updatedAt: date("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => [index("auth_session_user_idx").on(t.userId)],
);
export const account = sqliteTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: date("access_token_expires_at"),
    refreshTokenExpiresAt: date("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: date("created_at").notNull(),
    updatedAt: date("updated_at").notNull(),
  },
  (t) => [
    index("auth_account_user_idx").on(t.userId),
    uniqueIndex("auth_account_provider_idx").on(t.providerId, t.accountId),
  ],
);
export const verification = sqliteTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expires_at").notNull(),
    createdAt: date("created_at").notNull(),
    updatedAt: date("updated_at").notNull(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = sqliteTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
