CREATE TABLE newsletters (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 from_name TEXT NOT NULL DEFAULT '', from_email TEXT NOT NULL, reply_to TEXT NOT NULL DEFAULT '',
 postal_address TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 require_confirmation INTEGER NOT NULL DEFAULT 1, welcome_subject TEXT NOT NULL DEFAULT '',
 welcome_body TEXT NOT NULL DEFAULT '', cleanup_days INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE contacts (
 id TEXT PRIMARY KEY, newsletter_id TEXT NOT NULL REFERENCES newsletters(id), email TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','pending','unsubscribed','dormant','bounced','complained')),
 source TEXT NOT NULL DEFAULT 'dashboard', created_at TEXT NOT NULL,
 confirmed_at TEXT, unsubscribed_at TEXT, last_engaged_at TEXT, last_sent_at TEXT,
 UNIQUE(newsletter_id,email)
);
CREATE INDEX contacts_list ON contacts(newsletter_id,status,created_at);
CREATE TABLE campaigns (
 id TEXT PRIMARY KEY, newsletter_id TEXT NOT NULL REFERENCES newsletters(id), subject TEXT NOT NULL DEFAULT '',
 preview_text TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT 'rich' CHECK(format IN ('rich','html','markdown')),
 body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','paused','sent','canceled')),
 scheduled_at TEXT, started_at TEXT, sent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 archive_slug TEXT NOT NULL UNIQUE, archive_enabled INTEGER NOT NULL DEFAULT 1,
 snapshot TEXT, audience_limit INTEGER, pause_reason TEXT, test_sent_at TEXT
);
CREATE INDEX campaigns_due ON campaigns(status,scheduled_at);
CREATE TABLE deliveries (
 id TEXT PRIMARY KEY, campaign_id TEXT REFERENCES campaigns(id), contact_id TEXT REFERENCES contacts(id),
 newsletter_id TEXT NOT NULL REFERENCES newsletters(id), email TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'campaign' CHECK(kind IN ('campaign','confirmation','welcome','test')),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','delivered','bounced','complained','failed','suppressed','uncertain')),
 content TEXT, provider_id TEXT UNIQUE, created_at TEXT NOT NULL, queued_at TEXT, attempted_at TEXT,
 sent_at TEXT, opened_at TEXT, clicked_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 UNIQUE(campaign_id,contact_id,kind)
);
CREATE INDEX deliveries_pending ON deliveries(status,queued_at);
CREATE INDEX deliveries_campaign ON deliveries(campaign_id,status);
CREATE UNIQUE INDEX deliveries_welcome ON deliveries(contact_id) WHERE kind='welcome';
CREATE TABLE suppressions (email TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, version TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE email_events (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, type TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX events_provider ON email_events(provider_id);
