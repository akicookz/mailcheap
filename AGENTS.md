# Mailcheap on Cloudflare

## Workspace rules

- Never write tests. Verify with lint, build, runtime requests, and browser click-through.
- Use simple technical English. Use the local `/show-me` skill for explanations.
- Split work into commit checkpoints. Do not create PRs by default.
- Do not push, pull, deploy, or apply migrations without the user's explicit go.
- Read the surrounding request and data flow before editing.
- Reuse the existing shadcn components before creating UI components.
- Do not add borders, eyebrows, or all-caps letter-spaced labels to the UI.
- Keep browser checks hidden unless the user asks to see them.

## Project structure

This app follows ReplyMaven's root React/Vite + Hono Worker structure:

- `src/main.jsx`: React, QueryClientProvider, and BrowserRouter entry.
- `src/App.jsx`: application routes.
- `src/pages/`: one file per route screen.
- `src/components/`: layout, shared forms, and UI pieces. `ui/` contains shadcn primitives.
- `src/hooks/`: data loading and autosave hooks.
- `src/lib/`: client API and query helpers.
- `worker/index.ts`: Hono middleware, route mounts, queue and scheduled entrypoints.
- `worker/routes/`: dashboard and public HTTP routes.
- `worker/services/`: contact, email rendering, sending, and provider event logic.
- `worker/auth.ts`: single-administrator session authentication and signed links.
- `worker/types.ts`, `worker/validation.ts`: bindings and request schemas.
- `worker/db/`: Drizzle schemas, D1 query helpers, generated migrations in `drizzle/`.
- `worker/lib/`: request limits, configuration, and rate limiting.
- `shared/`: renderer and CSV logic used in both the browser and Worker.

Use Bun. `bun run dev` runs frontend and Worker through the Cloudflare Vite plugin with local bindings. No second API server is needed. Do not enable remote bindings for development.

Run `bun run lint`, `bun run typecheck`, and `bun run build` before completion claims. Frontend JSX is linted and bundled; Worker TypeScript is checked strictly. Browser checks are still required. `bun run cf-typegen` regenerates bindings.

Edit database definitions in `worker/db/*.ts`, then use `bun run db:generate` to generate SQL. Generation writes files only. Applying SQL with `db:migrate:dev` or `db:migrate:prod` requires approval. The initial schema was applied to local D1 on 2026-10-11 and the new remote `mailcheap` D1 database on 2026-10-12, both with user approval. The app is deployed at `https://mailcheap-cloudflare.launchfastshop.workers.dev` with sending disabled.

Sending is disabled by default. Use Cloudflare Email Sending, not SES or Email Routing forwarding. Never send a live test or campaign without an authorized recipient. Never put secrets or recipient data into commits.

The original upstream Next.js app is retained in Git at commit `67d13b0`. This working tree no longer uses Next.js.
