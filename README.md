# Mailcheap on Cloudflare

A newsletter app using Cloudflare Email Sending, organized like ReplyMaven: React pages and components in `src/`, Hono routes and services in `worker/`, and shared renderer logic in `shared/`. Run commands from the repository root. The original Next.js application remains in Git at commit `67d13b0`.

```text
React dashboard → Worker API → D1
                                 ↓
                         Queues → Cloudflare Email
                                 ↓
                      delivery events → D1 suppressions
Images → R2        Scheduled campaigns → Cron
```

Includes newsletter settings, subscribers and CSV import, rich text / HTML / Markdown campaign editing, previews, scheduling, limited-audience sends, reports, signup and confirmation pages, signed unsubscribe links, public archives, and API keys. The app has one administrator.

The MIT email renderer, Markdown and CSV helpers, autosave hook, and shadcn primitives were adapted from [marclou/mailcheap](https://github.com/marclou/mailcheap). The new app does not depend on SES, MongoDB, QStash, Vercel Blob, or a persistent application server.

## Local setup

Use Bun 1.3.14 and Node 22.12 or newer. Install with `bun install --frozen-lockfile`. Copy `.dev.vars.example` to `.dev.vars`, then set the three secrets. Keep this file private.

Drizzle schemas live in `worker/db/schema.ts` and `worker/db/auth.schema.ts`; generated SQL lives in `worker/db/drizzle/`. Under this workspace's instructions, applying even the local schema needs the user's explicit go. After that approval:

```sh
bun run db:migrate:dev
bun run dev
```

Open `http://127.0.0.1:5179`. The Cloudflare Vite plugin serves both React and the Worker on that origin with local bindings. Keep `APP_URL` equal to the browser origin because authenticated writes check Origin. `LOCAL_PREVIEW=true` allows local HTTP session cookies; it must be false in production.

Sending starts disabled. Wrangler's local Email binding simulates delivery; setting `SENDING_ENABLED=true` in local `.dev.vars` exercises that path without using a remote email binding. Do not enable remote development bindings for this workflow.

## Cloudflare setup

Deploy only after the requested deployment details and database approval are available:

1. Create a fresh D1 database named `mailcheap`, add its returned `database_id` and the chosen `account_id` to `wrangler.jsonc`, then apply the schema remotely after approval.
2. Create the `mailcheap-images` R2 bucket and queues `mailcheap-send`, `mailcheap-send-failed`, `mailcheap-email-events`, and `mailcheap-events-failed`.
3. Configure and verify an Email Sending subdomain. Use an address on that subdomain in newsletter settings. Incoming Email Routing alone is not the outbound service used by this app.
4. Set Worker secrets `ADMIN_EMAIL`, `ADMIN_PASSWORD` (16+ characters), and `LINK_SECRET` (32+ random characters). Test messages go only to `ADMIN_EMAIL`. Changing administrator credentials invalidates sessions. Preserve `LINK_SECRET` to keep existing email links valid.
5. Set `APP_URL` to the final HTTPS origin. Keep `LOCAL_PREVIEW=false` and `SENDING_ENABLED=false` for initial deployment. Run `bun run deploy` when deployment is authorized.
6. Add an Email Sending event subscription with source `email.sending` and destination queue `mailcheap-email-events`. Include delivered, bounced, complained, failed, and rejected events. The queue consumer expects Cloudflare's native event envelope; no public webhook is exposed.
7. Verify login, newsletter creation, draft save, preview, image upload, CSV import, scheduling, and unsubscribe with controlled data. Enable sending only after the sender and event subscription are ready; send one controlled test and verify its provider event before any campaign.

Cloudflare account access, quotas, and acceptance of newsletter traffic still need live verification. A successful build or package dry run does not establish email delivery. Current provider references: [Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/).

## Delivery behavior

- D1 freezes campaign content and audience at send start. Unique audience rows and atomic claims protect against queue replays.
- The consumer checks subscription, suppression, and campaign status immediately before claiming each send. An email already handed to the provider cannot be recalled.
- One consumer invocation runs at a time. `SEND_PER_SECOND` defaults to 2; signup bursts wait in the durable queue. Cron recovers unpublished queued rows.
- A timeout with an unknown provider result becomes `uncertain` and pauses the campaign. It is never automatically resent. Resolve it using provider evidence; there is no automatic reconciliation UI yet.
- Permanent bounces and complaints suppress an address across newsletters. Imported opt-outs enter with their final status. Imports never reactivate existing contacts.
- Delivery events can arrive after a campaign finishes. Opens and clicks are approximate engagement signals; common scanner traffic is excluded, but they are not proof of a human read.
- Review dead-letter queues and Worker logs operationally. There is no automatic dead-letter alerting integration yet.

## Current verification

The restructured app passes lint, Worker type checking, the frontend and Worker production build, and Wrangler deployment dry run. The local health endpoint responds; unauthenticated admin requests and cross-origin login writes are rejected. The login page has been checked through browser clicks at desktop and mobile sizes.

The initial schema was applied to **local D1 only** on 2026-10-11 with user approval. Browser sign-in and the authenticated Overview page work against that database. Other dashboard flows, queue consumption, provider events, and real delivery have **not** been verified at runtime. No remote schema has been applied. No remote app deployment or campaign send has been performed. No tests were written, per workspace instructions.

## API

Create a key in Settings and send it as `Authorization: Bearer <key>`. Keys can add subscriptions and create drafts, but cannot send a campaign.

- `POST /api/v1/contacts`: `{ "newsletter": "slug", "email": "reader@example.com" }`
- `POST /api/v1/campaigns`: `{ "newsletter": "slug", "subject": "Issue", "markdown": "Hello" }` (or `html`)
- `GET /api/v1/campaigns?newsletter=slug`: published archive entries

Public signup and archive: `/public/<newsletter-slug>`.

## Development structure

Use `bun run db:generate` after editing Drizzle schemas. It writes migration files without applying them. D1 query helpers retain explicit SQL for queue claims and audience snapshots. TanStack Query owns frontend request caching, and the Cloudflare Vite plugin builds frontend assets and the Worker together. `bun run lint`, `bun run typecheck`, and `bun run build` validate the project. `bun run preview` serves the production bundle locally.
