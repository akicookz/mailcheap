import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Single administrator, one Cloudflare account: the account hosting EMAIL.
export const cloudflareConnection = sqliteTable("cloudflare_connection", {
  id: integer("id").primaryKey().notNull(),
  account_id: text("account_id").notNull(),
  client_id: text("client_id").notNull(),
  credentials: text("credentials").notNull(),
  expires_at: integer("expires_at").notNull(),
  connected_at: text("connected_at").notNull(),
  status: text("status").notNull().default("active"),
  revision: text("revision").notNull(),
  refresh_lock: text("refresh_lock"),
  refresh_until: integer("refresh_until").notNull().default(0),
});
export type CloudflareConnection = typeof cloudflareConnection.$inferSelect;

export const cloudflareOAuthFlows = sqliteTable("cloudflare_oauth_flows", {
  state_hash: text("state_hash").primaryKey().notNull(),
  session_hash: text("session_hash").notNull(),
  verifier: text("verifier").notNull(),
  expires_at: integer("expires_at").notNull(),
});
