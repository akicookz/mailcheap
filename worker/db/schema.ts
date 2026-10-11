import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";

export const newsletters = sqliteTable("newsletters", {
  id: text("id").primaryKey().notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  from_name: text("from_name").notNull().default(""),
  from_email: text("from_email").notNull(),
  reply_to: text("reply_to").notNull().default(""),
  postal_address: text("postal_address").notNull().default(""),
  description: text("description").notNull().default(""),
  require_confirmation: integer("require_confirmation").notNull().default(1),
  welcome_subject: text("welcome_subject").notNull().default(""),
  welcome_body: text("welcome_body").notNull().default(""),
  cleanup_days: integer("cleanup_days").notNull().default(0),
  created_at: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
export type NewsletterRow = typeof newsletters.$inferSelect;

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey().notNull(),
    newsletter_id: text("newsletter_id")
      .notNull()
      .references(() => newsletters.id),
    email: text("email").notNull(),
    status: text("status", {
      enum: [
        "active",
        "pending",
        "unsubscribed",
        "dormant",
        "bounced",
        "complained",
      ],
    }).notNull(),
    source: text("source").notNull().default("dashboard"),
    created_at: text("created_at").notNull(),
    confirmed_at: text("confirmed_at"),
    unsubscribed_at: text("unsubscribed_at"),
    last_engaged_at: text("last_engaged_at"),
    last_sent_at: text("last_sent_at"),
  },
  (table) => [
    uniqueIndex("contacts_list_email").on(table.newsletter_id, table.email),
    index("contacts_list").on(
      table.newsletter_id,
      table.status,
      table.created_at,
    ),
    check(
      "contacts_status",
      sql`${table.status} IN ('active','pending','unsubscribed','dormant','bounced','complained')`,
    ),
  ],
);
export type ContactRow = typeof contacts.$inferSelect;

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey().notNull(),
    newsletter_id: text("newsletter_id")
      .notNull()
      .references(() => newsletters.id),
    subject: text("subject").notNull().default(""),
    preview_text: text("preview_text").notNull().default(""),
    format: text("format", { enum: ["rich", "html", "markdown"] })
      .notNull()
      .default("rich"),
    body: text("body").notNull().default(""),
    status: text("status", {
      enum: ["draft", "scheduled", "sending", "paused", "sent", "canceled"],
    })
      .notNull()
      .default("draft"),
    scheduled_at: text("scheduled_at"),
    started_at: text("started_at"),
    sent_at: text("sent_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    archive_slug: text("archive_slug").notNull().unique(),
    archive_enabled: integer("archive_enabled").notNull().default(1),
    snapshot: text("snapshot"),
    audience_limit: integer("audience_limit"),
    pause_reason: text("pause_reason"),
    test_sent_at: text("test_sent_at"),
  },
  (table) => [
    index("campaigns_due").on(table.status, table.scheduled_at),
    check(
      "campaigns_format",
      sql`${table.format} IN ('rich','html','markdown')`,
    ),
    check(
      "campaigns_status",
      sql`${table.status} IN ('draft','scheduled','sending','paused','sent','canceled')`,
    ),
  ],
);
export type CampaignRow = typeof campaigns.$inferSelect;

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey().notNull(),
    campaign_id: text("campaign_id").references(() => campaigns.id),
    contact_id: text("contact_id").references(() => contacts.id),
    newsletter_id: text("newsletter_id")
      .notNull()
      .references(() => newsletters.id),
    email: text("email").notNull(),
    kind: text("kind", {
      enum: ["campaign", "confirmation", "welcome", "test"],
    })
      .notNull()
      .default("campaign"),
    status: text("status", {
      enum: [
        "queued",
        "sending",
        "accepted",
        "delivered",
        "bounced",
        "complained",
        "failed",
        "suppressed",
        "uncertain",
      ],
    })
      .notNull()
      .default("queued"),
    content: text("content"),
    provider_id: text("provider_id").unique(),
    created_at: text("created_at").notNull(),
    queued_at: text("queued_at"),
    attempted_at: text("attempted_at"),
    sent_at: text("sent_at"),
    opened_at: text("opened_at"),
    clicked_at: text("clicked_at"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    uniqueIndex("deliveries_audience").on(
      table.campaign_id,
      table.contact_id,
      table.kind,
    ),
    uniqueIndex("deliveries_welcome")
      .on(table.contact_id)
      .where(sql`${table.kind} = 'welcome'`),
    index("deliveries_pending").on(table.status, table.queued_at),
    index("deliveries_campaign").on(table.campaign_id, table.status),
    check(
      "deliveries_kind",
      sql`${table.kind} IN ('campaign','confirmation','welcome','test')`,
    ),
    check(
      "deliveries_status",
      sql`${table.status} IN ('queued','sending','accepted','delivered','bounced','complained','failed','suppressed','uncertain')`,
    ),
  ],
);
export type DeliveryRow = typeof deliveries.$inferSelect;

export const suppressions = sqliteTable("suppressions", {
  email: text("email").primaryKey().notNull(),
  reason: text("reason").notNull(),
  created_at: text("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey().notNull(),
  count: integer("count").notNull(),
  expires_at: integer("expires_at").notNull(),
});
export const emailEvents = sqliteTable(
  "email_events",
  {
    id: text("id").primaryKey().notNull(),
    provider_id: text("provider_id").notNull(),
    type: text("type").notNull(),
    received_at: text("received_at").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [index("events_provider").on(table.provider_id)],
);
