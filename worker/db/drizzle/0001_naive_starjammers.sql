CREATE TABLE `cloudflare_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`client_id` text NOT NULL,
	`credentials` text NOT NULL,
	`expires_at` integer NOT NULL,
	`connected_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` text NOT NULL,
	`refresh_lock` text,
	`refresh_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloudflare_oauth_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`session_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
