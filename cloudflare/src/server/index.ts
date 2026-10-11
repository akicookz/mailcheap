import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type AppEnv,
  type Bindings,
  type Row,
  one,
  all,
  run,
  fail,
  parse,
  readJson,
  emailSchema,
  now,
  id,
  limit,
} from "./core";
import {
  requireAuth,
  originGuard,
  login,
  logout,
  authenticated,
  hash,
} from "./auth";
import { admin } from "./admin";
import { campaigns } from "./campaigns";
import { publicRoutes, signup } from "./public";
import { consume, tick } from "./sending";
import { consumeEvents } from "./events";

const app = new Hono<AppEnv>();
app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status);
  if (/UNIQUE constraint/.test(error.message))
    return c.json(
      { error: "That name, slug, or address already exists." },
      409,
    );
  console.error(
    JSON.stringify({
      event: "request_failed",
      path: c.req.path,
      error: error.message,
    }),
  );
  return c.json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
});
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
});
app.get("/api/health", (c) =>
  c.json({ ok: true, app: "mailcheap-cloudflare" }),
);
app.use("/api/login", originGuard);
app.post("/api/login", login);
app.get("/api/session", async (c) =>
  c.json({ authenticated: await authenticated(c) }),
);
app.use("/api/logout", originGuard);
app.post("/api/logout", logout);
app.use("/api/admin/*", requireAuth, originGuard);
app.route("/api/admin/campaigns", campaigns);
app.route("/api/admin", admin);
app.use("/api/v1/*", async (c, next) => {
  const token = c.req.header("authorization")?.replace(/^Bearer /, "") || "";
  const key = await one(
    c.env,
    "SELECT id FROM api_keys WHERE token_hash=? AND revoked_at IS NULL",
    await hash(token),
  );
  if (!key) fail("Invalid API key", 401);
  if (await limit(c.env, `api:${key.id}`, 600, 3600))
    fail("API rate limit reached", 429);
  await run(
    c.env,
    "UPDATE api_keys SET last_used_at=? WHERE id=?",
    now(),
    key.id,
  );
  await next();
});
app.post("/api/v1/contacts", async (c) => {
  const data = parse(
    z.object({ newsletter: z.string(), email: emailSchema }),
    await readJson(c.req.raw),
  );
  const list = await one(
    c.env,
    "SELECT * FROM newsletters WHERE slug=?",
    data.newsletter,
  );
  if (!list) fail("Newsletter not found", 404);
  return c.json(
    await signup(
      c.env,
      list,
      data.email,
      c.req.header("cf-connecting-ip") || "local",
    ),
    201,
  );
});
app.get("/api/v1/campaigns", async (c) =>
  c.json(
    await all(
      c.env,
      `SELECT c.id,c.subject,c.preview_text,c.archive_slug,c.sent_at,n.slug AS newsletter FROM campaigns c JOIN newsletters n ON n.id=c.newsletter_id WHERE n.slug=? AND c.status='sent' AND c.archive_enabled=1 ORDER BY c.sent_at DESC LIMIT 100`,
      c.req.query("newsletter") || "",
    ),
  ),
);
app.post("/api/v1/campaigns", async (c) => {
  const data = parse(
    z.object({
      newsletter: z.string(),
      subject: z.string().min(1).max(200),
      html: z.string().max(300000).optional(),
      markdown: z.string().max(300000).optional(),
      preview_text: z.string().max(300).default(""),
    }),
    await readJson(c.req.raw),
  );
  if (!data.html && !data.markdown) fail("Provide html or markdown");
  const list = await one(
    c.env,
    "SELECT id FROM newsletters WHERE slug=?",
    data.newsletter,
  );
  if (!list) fail("Newsletter not found", 404);
  const campaignId = id();
  await run(
    c.env,
    "INSERT INTO campaigns(id,newsletter_id,subject,preview_text,format,body,archive_slug,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    campaignId,
    list.id,
    data.subject,
    data.preview_text,
    data.html ? "html" : "markdown",
    data.html || data.markdown,
    `issue-${campaignId.slice(0, 8)}`,
    now(),
    now(),
  );
  return c.json(
    { id: campaignId, url: `${c.env.APP_URL}/campaigns/${campaignId}` },
    201,
  );
});
app.route("/public", publicRoutes);
app.get("/media/:key", async (c) => {
  const object = await c.env.IMAGES.get(c.req.param("key"));
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
});
app.all("/api/*", (c) => c.json({ error: "Endpoint not found" }, 404));
app.all("*", async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: blob: data:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  if (headers.get("content-type")?.includes("text/html"))
    headers.set("cache-control", "no-cache");
  return new Response(response.body, { status: response.status, headers });
});
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<unknown>, env: Bindings) {
    if (batch.queue === env.EVENTS_QUEUE)
      return consumeEvents(batch as MessageBatch<Row>, env);
    return consume(batch as MessageBatch<{ deliveryId: string }>, env);
  },
  async scheduled(_event: ScheduledController, env: Bindings) {
    await tick(env);
  },
} satisfies ExportedHandler<Bindings>;
