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

Drizzle schemas live in `worker/db/*.schema.ts` and `worker/db/schema.ts`; generated SQL lives in `worker/db/drizzle/`. Under this workspace's instructions, applying even the local schema needs the user's explicit go. After that approval:

```sh
bun run db:migrate:dev
bun run dev
```

Open `http://127.0.0.1:5179`. The Cloudflare Vite plugin serves both React and the Worker on that origin with local bindings. `preview_database_id: "DB"` preserves the existing local database identity when a production database ID is configured; keep `remote: false`. Keep `APP_URL` equal to the browser origin because authenticated writes check Origin. `LOCAL_PREVIEW=true` allows local HTTP session cookies; it must be false in production.

Sending starts disabled. Wrangler's local Email binding simulates delivery; setting `SENDING_ENABLED=true` in local `.dev.vars` exercises that path without using a remote email binding. Do not enable remote development bindings for this workflow.

## Cloudflare setup

The live dashboard is deployed at **https://mailcheap-cloudflare.launchfastshop.workers.dev** in the LaunchFast account. Its fresh D1 database, R2 image bucket, and four queues were created on 2026-10-12. The initial remote schema was applied with user approval. Sending remains disabled. The live administrator login matches the local login; private login details are in the ignored `.env.live-login.txt` file.

Deploy only after the requested deployment details and database approval are available:

1. Create a fresh D1 database named `mailcheap`, add its returned `database_id` and the chosen `account_id` to `wrangler.jsonc`, then apply the schema remotely after approval.
2. Create the `mailcheap-images` R2 bucket and queues `mailcheap-send`, `mailcheap-send-failed`, `mailcheap-email-events`, and `mailcheap-events-failed`.
3. Connect domain management as described below, then add and check a sending domain in **Domains**. Use an address on that exact domain in newsletter settings. Incoming Email Routing alone is not the outbound service used by this app.
4. Set Worker secrets `ADMIN_EMAIL`, `ADMIN_PASSWORD` (16+ characters), and `LINK_SECRET` (32+ random characters). Test messages go only to `ADMIN_EMAIL`. Changing administrator credentials invalidates sessions. Preserve `LINK_SECRET` to keep existing email links valid.
5. Set `APP_URL` to the final HTTPS origin. Keep `LOCAL_PREVIEW=false` and `SENDING_ENABLED=false` for initial deployment. Run `bun run deploy` when deployment is authorized.
6. Add an Email Sending event subscription with source `email.sending` and destination queue `mailcheap-email-events`. Include delivered, bounced, complained, failed, and rejected events. The queue consumer expects Cloudflare's native event envelope; no public webhook is exposed.
7. Verify login, newsletter creation, draft save, preview, image upload, CSV import, scheduling, and unsubscribe with controlled data. Enable sending only after the sender and event subscription are ready; send one controlled test and verify its provider event before any campaign.

Cloudflare account access, quotas, and acceptance of newsletter traffic still need live verification. A successful build or package dry run does not establish email delivery. Current provider references: [Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/).

## Domain management

The dashboard's **Domains** page uses Cloudflare as the source of truth. Connect using OAuth, then existing sending domains appear automatically. The connection is restricted to the account hosting the Worker because the `EMAIL` binding sends from that account.

### One-time OAuth setup

1. Apply `0001_naive_starjammers.sql` after migration approval. It adds `cloudflare_connection` and `cloudflare_oauth_flows`; existing tables are unchanged. Use `bun run db:migrate:dev` for local D1 or `bun run db:migrate:prod` for remote D1.
2. In Cloudflare → Manage Account → OAuth clients, create a **private** client named Mailcheap. Use response type `code`, grant types `authorization_code` and `refresh_token`, and authentication method `client_secret_post`.
3. Add required scopes `zone.read` and `email-sending.write`. Cloudflare adds `offline_access` when refresh tokens are enabled. Do not make these permissions optional.
4. Register the exact redirect URL `https://mailcheap-cloudflare.launchfastshop.workers.dev/api/admin/cloudflare/callback`. For local checks, register `http://127.0.0.1:5179/api/admin/cloudflare/callback` as an additional redirect URL.
5. Keep `CLOUDFLARE_ACCOUNT_ID` equal to the Worker account. Add `CLOUDFLARE_OAUTH_CLIENT_ID` and the Worker secret `CLOUDFLARE_OAUTH_CLIENT_SECRET`. Never prefix these with `VITE_`. Adding deployed secrets creates a deployment and requires approval.
6. Open **Domains → Connect Cloudflare**. Sign in, select the Worker account, and approve the requested access. The callback checks that the grant can access Email Sending in that account before saving it.

```text
Connect Cloudflare → approve account access → callback → encrypted D1 connection
                                                          ↓
                                             list zones / configure sending domains
```

The Worker exchanges authorization codes using PKCE. OAuth state expires after ten minutes, is bound to the current administrator session, and can be used once. Access and refresh tokens are encrypted with AES-GCM using a dedicated key derived from `LINK_SECRET`; they never reach the browser. Keep `LINK_SECRET` stable. Changing it requires reconnecting Cloudflare and also invalidates existing signed email links.

Access tokens refresh on demand under a D1 lock. A failed or uncertain refresh asks for reconnection instead of repeatedly using a possibly rotated token. Disconnect removes locally saved tokens and requests Cloudflare revocation; if revocation fails, the UI asks you to revoke the authorization in Cloudflare. Disconnect does **not** remove DNS records or stop the independent Worker Email binding. `SENDING_ENABLED=false` remains the app's sending switch. Connecting or adding a domain does not turn it on or send an email. Configure the delivery event subscription and verify a sender before explicitly enabling it.

For existing installations, `CLOUDFLARE_API_TOKEN` remains a server-side fallback **only when no OAuth client ID is configured**. Scope it to Email Sending edit and Zone read for the intended account/zones. A disconnected OAuth connection never silently falls back to that token.

Cloudflare references: [OAuth client registration](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/), [client API and refresh grants](https://developers.cloudflare.com/api/resources/iam/subresources/oauth_clients/methods/create/), [OAuth endpoints](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/). Scope IDs `zone.read` and `email-sending.write` were checked against Cloudflare's live `/oauth/scopes` endpoint on 2026-10-12.

```text
Domains → enter a domain → Check domain
  Active zone in this account → Configure domain → Cloudflare creates sending DNS
  Pending zone               → activation steps and assigned nameservers
  Domain outside the account → Cloudflare connection instructions
```

Email Sending currently [requires Cloudflare DNS](https://developers.cloudflare.com/email-service/get-started/send-emails/). For an externally hosted domain, first add its zone to the connected Cloudflare account, review imported website and mail records, and follow Cloudflare's nameserver and DNSSEC activation instructions. Copying SPF/DKIM records alone does not bypass that requirement. If a domain is already in the account but not found, check the account and permissions approved during connection.

The domain detail page shows the actual records returned by Cloudflare with copy buttons. **Check DNS** compares public DNS to those records; “Published” means the expected record was found, not that delivery was tested. Cloudflare's enabled state is shown separately. Existing DMARC policies should be reviewed before changing them. A disabled domain can be re-enabled by adding the same name again.

Domain creation is authenticated, checks the request origin, resolves the zone within the configured account, and is blocked when `LOCAL_PREVIEW=true`. Local development never changes real DNS through this feature. Domain lookup, setup instructions, and missing-connection states can be used without live writes. Live provider setup and DNS publication still require verification with the connected account; no live domain or email was created during implementation.

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

The initial schema was applied to local D1 on 2026-10-11 and to the new remote `mailcheap` D1 database on 2026-10-12, both with user approval. The Worker deployment succeeded. Live browser checks confirmed administrator sign-in, Overview data loading, the newsletter setup form, Settings, and Domains. The live database starts empty; local preview data was not copied. Queue consumption, provider events, live domain configuration, and actual email delivery remain unverified. The OAuth client credentials (or legacy API token) and Email Sending event subscription still need configuration before live sending is enabled. The OAuth changes have not yet been deployed. No campaign or test email was sent. No tests were written, per workspace instructions.

OAuth implementation checks (2026-10-12): lint, typecheck, and build pass. One independent code review found a disconnect race and an unsafe callback-message lookup; both were fixed. Local browser clicks verified Domains, Settings, the one-time setup dialog, disconnected lookup, and an unexpected callback query value. Runtime requests verified login, unauthenticated rejection, disconnected status, and the unconfigured-client error. The Vite proxy returned an error for the cross-origin negative probe, so that check does not establish the Worker's rejection response. Live authorization-code exchange, refresh, revocation, and DNS writes remain unverified until a private OAuth client is registered and configured. The OAuth migration is generated but not applied. No deployment was performed for this change.

## API

Create a key in Settings and send it as `Authorization: Bearer <key>`. Keys can add subscriptions and create drafts, but cannot send a campaign.

- `POST /api/v1/contacts`: `{ "newsletter": "slug", "email": "reader@example.com" }`
- `POST /api/v1/campaigns`: `{ "newsletter": "slug", "subject": "Issue", "markdown": "Hello" }` (or `html`)
- `GET /api/v1/campaigns?newsletter=slug`: published archive entries

Public signup and archive: `/public/<newsletter-slug>`.

## Development structure

Use `bun run db:generate` after editing Drizzle schemas. It writes migration files without applying them. D1 query helpers retain explicit SQL for queue claims and audience snapshots. TanStack Query owns frontend request caching, and the Cloudflare Vite plugin builds frontend assets and the Worker together. `bun run lint`, `bun run typecheck`, and `bun run build` validate the project. `bun run preview` serves the production bundle locally.
