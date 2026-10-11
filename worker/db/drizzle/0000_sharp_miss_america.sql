CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`newsletter_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preview_text` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'rich' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` text,
	`started_at` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archive_slug` text NOT NULL,
	`archive_enabled` integer DEFAULT 1 NOT NULL,
	`snapshot` text,
	`audience_limit` integer,
	`pause_reason` text,
	`test_sent_at` text,
	FOREIGN KEY (`newsletter_id`) REFERENCES `newsletters`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "campaigns_format" CHECK("campaigns"."format" IN ('rich','html','markdown')),
	CONSTRAINT "campaigns_status" CHECK("campaigns"."status" IN ('draft','scheduled','sending','paused','sent','canceled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_archive_slug_unique` ON `campaigns` (`archive_slug`);--> statement-breakpoint
CREATE INDEX `campaigns_due` ON `campaigns` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`newsletter_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`source` text DEFAULT 'dashboard' NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	`unsubscribed_at` text,
	`last_engaged_at` text,
	`last_sent_at` text,
	FOREIGN KEY (`newsletter_id`) REFERENCES `newsletters`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contacts_status" CHECK("contacts"."status" IN ('active','pending','unsubscribed','dormant','bounced','complained'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_list_email` ON `contacts` (`newsletter_id`,`email`);--> statement-breakpoint
CREATE INDEX `contacts_list` ON `contacts` (`newsletter_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`contact_id` text,
	`newsletter_id` text NOT NULL,
	`email` text NOT NULL,
	`kind` text DEFAULT 'campaign' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`content` text,
	`provider_id` text,
	`created_at` text NOT NULL,
	`queued_at` text,
	`attempted_at` text,
	`sent_at` text,
	`opened_at` text,
	`clicked_at` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`newsletter_id`) REFERENCES `newsletters`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "deliveries_kind" CHECK("deliveries"."kind" IN ('campaign','confirmation','welcome','test')),
	CONSTRAINT "deliveries_status" CHECK("deliveries"."status" IN ('queued','sending','accepted','delivered','bounced','complained','failed','suppressed','uncertain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_provider_id_unique` ON `deliveries` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_audience` ON `deliveries` (`campaign_id`,`contact_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_welcome` ON `deliveries` (`contact_id`) WHERE "deliveries"."kind" = 'welcome';--> statement-breakpoint
CREATE INDEX `deliveries_pending` ON `deliveries` (`status`,`queued_at`);--> statement-breakpoint
CREATE INDEX `deliveries_campaign` ON `deliveries` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`type` text NOT NULL,
	`received_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_provider` ON `email_events` (`provider_id`);--> statement-breakpoint
CREATE TABLE `newsletters` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`from_email` text NOT NULL,
	`reply_to` text DEFAULT '' NOT NULL,
	`postal_address` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`require_confirmation` integer DEFAULT 1 NOT NULL,
	`welcome_subject` text DEFAULT '' NOT NULL,
	`welcome_body` text DEFAULT '' NOT NULL,
	`cleanup_days` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletters_slug_unique` ON `newsletters` (`slug`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_token_hash_unique` ON `api_keys` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`expires_at` integer NOT NULL
);
