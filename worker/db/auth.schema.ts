import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  token_hash: text("token_hash").primaryKey().notNull(),
  version: text("version").notNull(),
  expires_at: integer("expires_at").notNull(),
});
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  created_at: text("created_at").notNull(),
  last_used_at: text("last_used_at"),
  revoked_at: text("revoked_at"),
});
