import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { page } from "../views/public-page";
import sanitizeHtml from "sanitize-html";
import { type AppEnv, type Row } from "../types";
import { all, one, run } from "../db/query";
import { fail, readLimited } from "../lib/http";
import { parse, emailSchema } from "../validation";
import { now, sending } from "../lib/config";
import { limit } from "../lib/rate-limit";
import { readLink } from "../auth";
import { addContact, unsubscribe } from "../services/contact-service";
import { queueSignup } from "../services/sending-service";
import { escapeHtml, renderEmail } from "../../shared/render-email.js";

export const publicRoutes = new Hono<AppEnv>();
async function readForm(request: Request) {
  const bytes = await readLimited(request, 12000);
  const data: Record<string, string> = {};
  new URLSearchParams(new TextDecoder().decode(bytes)).forEach((value, key) => {
    data[key] = value;
  });
  return data;
}
publicRoutes.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
});
publicRoutes.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500;
  const message =
    error instanceof HTTPException
      ? error.message
      : "Please try again in a moment.";
  const title =
    status === 404
      ? "Page not found"
      : status === 503
        ? "Subscriptions are not open yet"
        : "We couldn’t complete that request";
  if (!(error instanceof HTTPException))
    console.error(
      JSON.stringify({ event: "public_page_failed", message: error.message }),
    );
  return c.html(
    page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`),
    status,
  );
});
publicRoutes.get("/unsubscribe", async (c) => {
  const token = c.req.query("token") || "";
  const data = await readLink(c.env, "unsubscribe", token);
  if (!data?.contact)
    return c.html(
      page(
        "Invalid link",
        "<h1>This link is invalid</h1><p>Use the unsubscribe link in your email.</p>",
      ),
      400,
    );
  return c.html(
    page(
      "Unsubscribe",
      `<h1>Leave this newsletter?</h1><p>You can unsubscribe with one click below.</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button>Unsubscribe</button></form>`,
    ),
  );
});
publicRoutes.post("/unsubscribe", async (c) => {
  let token = c.req.query("token") || "";
  if (!token) {
    const data = await readForm(c.req.raw);
    token = String(data.token || "");
  }
  const data = await readLink(c.env, "unsubscribe", token);
  if (!data?.contact)
    return c.html(page("Invalid link", "<h1>This link is invalid</h1>"), 400);
  await unsubscribe(c.env, data.contact);
  return c.html(
    page(
      "Unsubscribed",
      "<h1>You’re unsubscribed.</h1><p>You will no longer receive this newsletter.</p>",
    ),
  );
});
publicRoutes.get("/confirm", async (c) => {
  const token = c.req.query("token") || "";
  const data = await readLink(c.env, "confirm", token);
  if (!data?.contact || Number(data.until) < Date.now())
    return c.html(
      page(
        "Expired link",
        "<h1>This link has expired.</h1><p>Subscribe again to get a new confirmation email.</p>",
      ),
      400,
    );
  return c.html(
    page(
      "Confirm subscription",
      `<h1>Confirm your subscription</h1><p>Click below to start receiving the newsletter.</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button>Confirm subscription</button></form>`,
    ),
  );
});
publicRoutes.post("/confirm", async (c) => {
  const body = await readForm(c.req.raw);
  const data = await readLink(c.env, "confirm", String(body.token || ""));
  if (!data?.contact || Number(data.until) < Date.now())
    fail("This confirmation link has expired");
  await run(
    c.env,
    `UPDATE contacts SET status='active',confirmed_at=?,last_engaged_at=? WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM suppressions WHERE email=contacts.email)`,
    now(),
    now(),
    data.contact,
  );
  {
    const contact = await one(
      c.env,
      "SELECT * FROM contacts WHERE id=?",
      data.contact,
    );
    if (!contact || contact.status !== "active")
      fail("This subscription is no longer eligible for confirmation", 409);
    const list = await one(
      c.env,
      "SELECT * FROM newsletters WHERE id=?",
      contact!.newsletter_id,
    );
    await queueSignup(c.env, list!, contact!);
  }
  return c.html(
    page(
      "Subscription confirmed",
      "<h1>Subscription confirmed.</h1><p>You’re on the list. Thanks for joining.</p>",
    ),
  );
});
async function engagement(
  env: AppEnv["Bindings"],
  deliveryId: string,
  kind: "open" | "click",
  agent: string,
) {
  const delivery = await one(
    env,
    "SELECT * FROM deliveries WHERE id=? AND sent_at IS NOT NULL",
    deliveryId,
  );
  if (
    !delivery ||
    /bot|crawl|scan|preview|proofpoint|mimecast|safelinks|headless/i.test(
      agent,
    ) ||
    (kind === "click" && Date.now() - Date.parse(delivery.sent_at) < 30000)
  )
    return;
  await run(
    env,
    `UPDATE deliveries SET opened_at=COALESCE(opened_at,?)${kind === "click" ? ",clicked_at=COALESCE(clicked_at,?)" : ""} WHERE id=?`,
    now(),
    ...(kind === "click" ? [now()] : []),
    deliveryId,
  );
  if (delivery.contact_id)
    await run(
      env,
      `UPDATE contacts SET last_engaged_at=? WHERE id=?`,
      now(),
      delivery.contact_id,
    );
}
publicRoutes.get("/open", async (c) => {
  const data = await readLink(c.env, "open", c.req.query("token") || "");
  if (data?.delivery)
    await engagement(
      c.env,
      data.delivery,
      "open",
      c.req.header("user-agent") || "",
    );
  return new Response(
    Uint8Array.from(
      atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
      (n) => n.charCodeAt(0),
    ),
    { headers: { "content-type": "image/gif", "cache-control": "no-store" } },
  );
});
publicRoutes.get("/click", async (c) => {
  const data = await readLink(c.env, "click", c.req.query("token") || "");
  if (!data?.url || !/^https?:\/\//i.test(data.url)) fail("Invalid link");
  await engagement(
    c.env,
    data.delivery,
    "click",
    c.req.header("user-agent") || "",
  );
  return c.redirect(data.url, 302);
});
export async function signup(
  env: AppEnv["Bindings"],
  list: Row,
  email: string,
  ip: string,
) {
  if (list.require_confirmation && !sending(env))
    fail("Subscriptions are not open yet. Please try again later.", 503);
  if (
    (await limit(env, `signup-ip:${ip}`, 5, 600)) ||
    (await limit(env, `signup-email:${email}`, 3, 3600))
  )
    fail("Please wait before subscribing again", 429);
  const result = await addContact(env, list, { email, source: "signup" });
  if (result.contact && ["active", "pending"].includes(result.contact.status))
    await queueSignup(env, list, result.contact);
  return {
    message: list.require_confirmation
      ? "Check your inbox to confirm your subscription."
      : "Thanks. Your subscription request has been received.",
  };
}
publicRoutes.post("/:slug/subscribe", async (c) => {
  if (c.req.header("origin") !== new URL(c.env.APP_URL).origin)
    fail("Invalid request origin", 403);
  const list = await one(
    c.env,
    "SELECT * FROM newsletters WHERE slug=?",
    c.req.param("slug"),
  );
  if (!list) fail("Newsletter not found", 404);
  const body = await readForm(c.req.raw);
  const email = parse(emailSchema, body.email);
  const result = await signup(
    c.env,
    list,
    email,
    c.req.header("cf-connecting-ip") || "local",
  );
  return c.html(
    page(
      list.name,
      `<h1>Thank you.</h1><p>${escapeHtml(result.message)}</p><a href="/public/${escapeHtml(list.slug)}">Back to the newsletter</a>`,
    ),
  );
});
publicRoutes.get("/:slug/:issue", async (c) => {
  const list = await one(
    c.env,
    "SELECT * FROM newsletters WHERE slug=?",
    c.req.param("slug"),
  );
  if (!list) fail("Newsletter not found", 404);
  const issue = await one(
    c.env,
    `SELECT * FROM campaigns WHERE newsletter_id=? AND archive_slug=? AND archive_enabled=1 AND status='sent'`,
    list.id,
    c.req.param("issue"),
  );
  if (!issue) fail("Issue not found", 404);
  const frozen = issue.snapshot ? JSON.parse(issue.snapshot).draft : issue;
  const rendered = renderEmail({
    format: frozen.format,
    html: frozen.body,
    markdown: frozen.body,
    subject: frozen.subject,
    newsletter: list,
    isWebVersion: true,
  });
  const content = sanitizeHtml(rendered.html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
      a: ["href", "title", "target"],
      "*": ["style"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
  });
  return c.html(
    page(
      frozen.subject,
      `<a class="back-link" href="/public/${escapeHtml(list.slug)}">← ${escapeHtml(list.name)}</a><h1>${escapeHtml(frozen.subject)}</h1><small>${escapeHtml(issue.sent_at?.slice(0, 10) || "")}</small><div class="archive-message">${content}</div>`,
    ),
  );
});
publicRoutes.get("/:slug", async (c) => {
  const list = await one(
    c.env,
    "SELECT * FROM newsletters WHERE slug=?",
    c.req.param("slug"),
  );
  if (!list) fail("Newsletter not found", 404);
  const issues = await all(
    c.env,
    `SELECT subject,preview_text,archive_slug,sent_at FROM campaigns WHERE newsletter_id=? AND status='sent' AND archive_enabled=1 ORDER BY sent_at DESC LIMIT 100`,
    list.id,
  );
  return c.html(
    page(
      list.name,
      `<h1>${escapeHtml(list.name)}</h1><p>${escapeHtml(list.description)}</p><form method="post" action="/public/${escapeHtml(list.slug)}/subscribe"><label for="email">Your email address</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"><button>Subscribe</button></form><h2 class="archive-heading">Past issues</h2>${issues.length ? issues.map((issue) => `<article><small>${escapeHtml(issue.sent_at?.slice(0, 10) || "")}</small><h2><a href="/public/${escapeHtml(list.slug)}/${escapeHtml(issue.archive_slug)}">${escapeHtml(issue.subject)}</a></h2><p>${escapeHtml(issue.preview_text)}</p></article>`).join("") : '<p class="archive-empty">No issues published yet. Subscribe to receive the first one.</p>'}`,
    ),
  );
});
