import { Hono } from "hono";
import { z } from "zod";
import {
  type AppEnv,
  all,
  one,
  run,
  now,
  id,
  fail,
  parse,
  readJson,
  readLimited,
  newsletterSchema,
  newsletter,
  local,
  sending,
} from "./core";
import { randomToken, hash } from "./auth";
import {
  addContact,
  unsubscribe,
  cleanList,
  contactList,
  suppress,
} from "./contacts";
import { sanitizeImportRow } from "../shared/csv-import.js";

export const admin = new Hono<AppEnv>();
admin.get("/status", async (c) =>
  c.json({
    sending_enabled: sending(c.env),
    local_preview: local(c.env),
    email: c.env.ADMIN_EMAIL,
    app_url: c.env.APP_URL,
    provider: "Cloudflare Email",
    send_per_second: Number(c.env.SEND_PER_SECOND),
    uncertain:
      (
        await one(
          c.env,
          `SELECT count(*) AS n FROM deliveries WHERE status='uncertain'`,
        )
      )?.n || 0,
  }),
);
admin.get("/overview", async (c) => {
  const [contacts, campaigns, recent, activity] = await Promise.all([
    one(
      c.env,
      `SELECT count(*) AS total, SUM(status='active') AS active, SUM(status='pending') AS pending FROM contacts`,
    ),
    one(
      c.env,
      `SELECT count(*) AS total,SUM(status='draft') AS drafts,SUM(status='scheduled') AS scheduled FROM campaigns`,
    ),
    all(
      c.env,
      `SELECT c.*,n.name AS newsletter_name,(SELECT count(*) FROM deliveries d WHERE d.campaign_id=c.id AND d.sent_at IS NOT NULL) AS sent FROM campaigns c JOIN newsletters n ON n.id=c.newsletter_id ORDER BY c.updated_at DESC LIMIT 8`,
    ),
    all(
      c.env,
      `SELECT substr(created_at,1,10) AS day,count(*) AS count FROM contacts WHERE created_at>=? GROUP BY day ORDER BY day`,
      new Date(Date.now() - 30 * 86400000).toISOString(),
    ),
  ]);
  const mail = await one(
    c.env,
    `SELECT SUM(sent_at IS NOT NULL) AS sent,SUM(status='delivered') AS delivered,SUM(opened_at IS NOT NULL) AS opened,SUM(clicked_at IS NOT NULL) AS clicked,SUM(status='bounced') AS bounced,SUM(status='complained') AS complained FROM deliveries WHERE kind='campaign'`,
  );
  return c.json({ contacts, campaigns, recent, activity, mail });
});
admin.get("/newsletters", async (c) =>
  c.json(
    await all(
      c.env,
      `SELECT n.*,(SELECT count(*) FROM contacts c WHERE c.newsletter_id=n.id AND c.status='active') AS active_count FROM newsletters n ORDER BY n.created_at`,
    ),
  ),
);
admin.post("/newsletters", async (c) => {
  const data = parse(newsletterSchema, await readJson(c.req.raw));
  const newsletterId = id();
  await run(
    c.env,
    `INSERT INTO newsletters(id,name,slug,from_name,from_email,reply_to,postal_address,description,require_confirmation,welcome_subject,welcome_body,cleanup_days) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    newsletterId,
    data.name,
    data.slug,
    data.from_name,
    data.from_email,
    data.reply_to,
    data.postal_address,
    data.description,
    Number(data.require_confirmation),
    data.welcome_subject,
    data.welcome_body,
    data.cleanup_days,
  );
  return c.json(await newsletter(c.env, newsletterId), 201);
});
admin.put("/newsletters/:id", async (c) => {
  const data = parse(newsletterSchema, await readJson(c.req.raw));
  await newsletter(c.env, c.req.param("id"));
  await run(
    c.env,
    `UPDATE newsletters SET name=?,slug=?,from_name=?,from_email=?,reply_to=?,postal_address=?,description=?,require_confirmation=?,welcome_subject=?,welcome_body=?,cleanup_days=? WHERE id=?`,
    data.name,
    data.slug,
    data.from_name,
    data.from_email,
    data.reply_to,
    data.postal_address,
    data.description,
    Number(data.require_confirmation),
    data.welcome_subject,
    data.welcome_body,
    data.cleanup_days,
    c.req.param("id"),
  );
  return c.json({ ok: true });
});
admin.post("/newsletters/:id/cleanup", async (c) => {
  await newsletter(c.env, c.req.param("id"));
  const data = parse(
    z.object({
      days: z.number().int().min(30).max(3650),
      apply: z.boolean().default(false),
    }),
    await readJson(c.req.raw),
  );
  return c.json(
    await cleanList(c.env, c.req.param("id"), data.days, data.apply),
  );
});
admin.get("/contacts", async (c) =>
  c.json(await contactList(c.env, c.req.query())),
);
admin.post("/contacts", async (c) => {
  const data = parse(
    z.object({
      newsletter_id: z.string(),
      email: z.string(),
      confirmed: z.literal(true),
    }),
    await readJson(c.req.raw),
  );
  const list = await newsletter(c.env, data.newsletter_id);
  return c.json(
    await addContact(c.env, list, {
      email: data.email,
      source: "dashboard",
      confirmed: true,
    }),
    201,
  );
});
admin.post("/contacts/:id/unsubscribe", async (c) => {
  await unsubscribe(c.env, c.req.param("id"));
  return c.json({ ok: true });
});
admin.post("/contacts/import", async (c) => {
  const body = parse(
    z.object({
      newsletter_id: z.string(),
      confirmed: z.literal(true),
      rows: z.array(z.unknown()).min(1).max(500),
    }),
    await readJson(c.req.raw),
  );
  const list = await newsletter(c.env, body.newsletter_id);
  let created = 0,
    skipped = 0;
  // Import never changes an existing contact into active, and preserves imported opt-outs globally.
  for (const row of body.rows) {
    const data = sanitizeImportRow(row);
    if (!data) {
      skipped++;
      continue;
    }
    if (data.status === "bounced" || data.status === "complained")
      await suppress(
        c.env,
        data.email,
        data.status === "complained" ? "complaint" : "bounce",
      );
    const result = await addContact(c.env, list, {
      email: data.email,
      source: "csv-import",
      confirmed: true,
      initialStatus: data.status,
    });
    if (result.created) created++;
    else skipped++;
    if (data.status === "unsubscribed" && result.contact)
      await unsubscribe(c.env, result.contact.id);
    else if (data.status === "dormant" && result.contact)
      await run(
        c.env,
        `UPDATE contacts SET status='dormant' WHERE id=? AND status='active'`,
        result.contact.id,
      );
  }
  return c.json({ created, skipped });
});
admin.get("/keys", async (c) =>
  c.json(
    await all(
      c.env,
      "SELECT id,name,prefix,created_at,last_used_at,revoked_at FROM api_keys ORDER BY created_at DESC",
    ),
  ),
);
admin.post("/keys", async (c) => {
  const { name } = parse(
    z.object({ name: z.string().trim().min(1).max(100) }),
    await readJson(c.req.raw),
  );
  const token = `mc_${randomToken()}`;
  await run(
    c.env,
    "INSERT INTO api_keys(id,name,token_hash,prefix,created_at) VALUES (?,?,?,?,?)",
    id(),
    name,
    await hash(token),
    token.slice(0, 10),
    now(),
  );
  return c.json({ token }, 201);
});
admin.delete("/keys/:id", async (c) => {
  await run(
    c.env,
    "UPDATE api_keys SET revoked_at=? WHERE id=?",
    now(),
    c.req.param("id"),
  );
  return c.json({ ok: true });
});
admin.post("/uploads", async (c) => {
  const type = c.req.header("content-type") || "";
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  if (!extensions[type]) fail("Upload a PNG, JPEG, GIF, or WebP image");
  const bytes = await readLimited(c.req.raw, 5 * 1024 * 1024);
  const prefix = [...bytes.slice(0, 12)];
  const valid =
    type === "image/png"
      ? prefix.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
      : type === "image/jpeg"
        ? prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255
        : type === "image/gif"
          ? new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/)
          : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!valid) fail("The file does not match its image type");
  const key = `${id()}.${extensions[type]}`;
  await c.env.IMAGES.put(key, bytes, {
    httpMetadata: {
      contentType: type,
      cacheControl: "public,max-age=31536000,immutable",
    },
  });
  return c.json({ url: `${c.env.APP_URL}/media/${key}` }, 201);
});
