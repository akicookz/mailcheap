# Cloudflare Mailcheap build

The requested result is a newsletter application using Cloudflare Workers, D1, R2, Queues, Cron, and Email Sending. The user chose Cloudflare Email after discussing its transactional-only FAQ. No real campaign is sent as part of development. A live delivery check requires a sender domain and an address controlled by the user.

## Implementation

Build a standalone React/Vite application in `cloudflare/`. Keep upstream source available as a reference. Reuse the MIT-licensed email renderer, Markdown helpers, CSV normalization, and existing shadcn components. Replace MongoDB, QStash, Vercel Blob, and SES integrations. No Next.js runtime is used by the new application.

1. Foundation checkpoint: Worker API, SQL schema, session authentication, newsletter and contact management, R2 uploads, and local configuration.
2. Sending checkpoint: campaign drafts and previews, audience snapshots, durable queue dispatch, rate control, scheduled sending, retry/uncertain-outcome handling, signed unsubscribe and confirmation links, delivery events, and reporting.
3. Interface checkpoint: borderless dashboard, editor, subscriber import, newsletter settings, reports, API keys, and public archives. Reuse existing shadcn primitives.
4. Validation checkpoint: build and type checks, browser click-through of real local routes, runtime inspection, deployment and public URL verification if account access and new-database initialization are available.

## Data and boundaries

- D1 owns newsletters, subscribers, campaign state, individual deliveries, suppressions, API keys, sessions, and rate counters.
- The API requires a session; mutating browser requests require matching Origin. Public signup, confirmation, tracking, and unsubscribe endpoints have separate validation and rate limits.
- Queues carry delivery IDs, never authoritative recipient or content data. Each consumer rechecks status and suppression before claiming a send.
- A unique campaign/contact constraint prevents duplicate audience rows. An atomic claim prevents duplicate queue delivery from causing duplicate sends. Ambiguous provider outcomes are retained for review, not automatically resent.
- Cron dispatches pending outbox rows and due campaigns. Campaign content and sender settings are frozen when sending starts.
- Provider delivery events enter through a separate Cloudflare queue binding, not an unauthenticated webhook. Events are deduplicated and update global suppressions for complaints and permanent bounces.
- Sending is disabled by default; local development uses simulated email delivery. No subscriber imports from existing services and no real campaign sends.

## Validation constraints

Do not write tests. Use compiler/build checks, direct runtime inspection, and browser clicks. Do not push. Deployment was requested; existing resources must not be modified. Ask for any missing sender/domain information. Database initialization must be reviewed before execution under the user's migration rule.

## Review focus

- A queue replay or provider timeout must not duplicate an email.
- An unsubscribe or suppression added after audience selection must prevent subsequent sending.
- Signup/import must not reactivate opted-out or suppressed contacts silently.
- Scheduling and pauses must survive process restarts and stale queue messages.
- Editor previews and public archives must not execute email HTML as application scripts.
