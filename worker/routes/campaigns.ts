import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv } from "../types";
import { all, one, run } from "../db/query";
import { now, id } from "../lib/config";
import { fail, readJson } from "../lib/http";
import { parse, campaignSchema } from "../validation";
import { newsletter, campaign } from "../services/catalog-service";
import { renderDraft, validateContent } from "../services/email-service";
import {
  startCampaign,
  queueTest,
  dispatch,
} from "../services/sending-service";

export const campaigns = new Hono<AppEnv>();
campaigns.get("/", async (c) =>
  c.json(
    await all(
      c.env,
      `SELECT c.*,n.name AS newsletter_name,(SELECT count(*) FROM deliveries d WHERE d.campaign_id=c.id AND d.kind='campaign' AND d.sent_at IS NOT NULL) AS sent FROM campaigns c JOIN newsletters n ON n.id=c.newsletter_id ORDER BY c.created_at DESC LIMIT 200`,
    ),
  ),
);
campaigns.post("/", async (c) => {
  const data = parse(
    z.object({
      newsletter_id: z.string(),
      subject: z.string().max(200).default(""),
    }),
    await readJson(c.req.raw),
  );
  await newsletter(c.env, data.newsletter_id);
  const campaignId = id();
  const slug =
    data.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "issue";
  await run(
    c.env,
    "INSERT INTO campaigns(id,newsletter_id,subject,archive_slug,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    campaignId,
    data.newsletter_id,
    data.subject,
    `${slug}-${campaignId.slice(0, 8)}`,
    now(),
    now(),
  );
  return c.json(await campaign(c.env, campaignId), 201);
});
campaigns.get("/:id", async (c) => {
  const draft = await campaign(c.env, c.req.param("id"));
  const [list, stats, deliveries] = await Promise.all([
    newsletter(c.env, draft.newsletter_id),
    one(
      c.env,
      `SELECT count(*) AS recipients,SUM(sent_at IS NOT NULL) AS sent,SUM(status='delivered') AS delivered,SUM(status='bounced') AS bounced,SUM(status='complained') AS complained,SUM(opened_at IS NOT NULL) AS opened,SUM(clicked_at IS NOT NULL) AS clicked,SUM(status='queued') AS queued,SUM(status='failed') AS failed,SUM(status='suppressed') AS suppressed,SUM(status='uncertain') AS uncertain FROM deliveries WHERE campaign_id=? AND kind='campaign'`,
      draft.id,
    ),
    all(
      c.env,
      `SELECT id,email,kind,status,sent_at,opened_at,clicked_at,error FROM deliveries WHERE campaign_id=? ORDER BY created_at DESC LIMIT 200`,
      draft.id,
    ),
  ]);
  const audience = await one(
    c.env,
    `SELECT count(*) AS count FROM contacts c WHERE c.newsletter_id=? AND c.status='active' AND NOT EXISTS(SELECT 1 FROM suppressions s WHERE s.email=c.email)`,
    list.id,
  );
  return c.json({
    campaign: draft,
    newsletter: list,
    stats,
    deliveries,
    audience: audience?.count || 0,
  });
});
campaigns.put("/:id", async (c) => {
  const data = parse(campaignSchema, await readJson(c.req.raw));
  const result = await run(
    c.env,
    `UPDATE campaigns SET subject=?,preview_text=?,format=?,body=?,archive_enabled=?,updated_at=? WHERE id=? AND status='draft'`,
    data.subject,
    data.preview_text,
    data.format,
    data.body,
    Number(data.archive_enabled),
    now(),
    c.req.param("id"),
  );
  if (!result.meta.changes)
    fail("Only drafts can be edited. Unschedule this campaign first.", 409);
  return c.json({ ok: true });
});
campaigns.post("/:id/preview", async (c) => {
  const draft = await campaign(c.env, c.req.param("id"));
  const data = parse(campaignSchema, await readJson(c.req.raw));
  return c.json(
    renderDraft(
      { ...draft, ...data },
      await newsletter(c.env, draft.newsletter_id),
    ),
  );
});
campaigns.post("/:id/send", async (c) => {
  const data = parse(
    z.object({
      audience_limit: z.number().int().min(1).max(1000000).optional(),
    }),
    await readJson(c.req.raw),
  );
  await startCampaign(c.env, c.req.param("id"), data.audience_limit);
  return c.json({ ok: true });
});
campaigns.post("/:id/test", async (c) =>
  c.json(await queueTest(c.env, c.req.param("id"))),
);
campaigns.post("/:id/schedule", async (c) => {
  const data = parse(
    z.object({
      scheduled_at: z.iso.datetime(),
      audience_limit: z.number().int().min(1).max(1000000).optional(),
    }),
    await readJson(c.req.raw),
  );
  const time = new Date(data.scheduled_at).getTime();
  if (time < Date.now() + 60000 || time > Date.now() + 365 * 86400000)
    fail("Choose a time between one minute and one year from now");
  const draft = await campaign(c.env, c.req.param("id"));
  validateContent(draft, await newsletter(c.env, draft.newsletter_id));
  const result = await run(
    c.env,
    `UPDATE campaigns SET status='scheduled',scheduled_at=?,audience_limit=?,updated_at=? WHERE id=? AND status IN ('draft','scheduled')`,
    new Date(time).toISOString(),
    data.audience_limit || null,
    now(),
    draft.id,
  );
  if (!result.meta.changes) fail("This campaign cannot be scheduled", 409);
  return c.json({ ok: true });
});
campaigns.post("/:id/unschedule", async (c) => {
  await run(
    c.env,
    `UPDATE campaigns SET status='draft',scheduled_at=NULL,updated_at=? WHERE id=? AND status='scheduled'`,
    now(),
    c.req.param("id"),
  );
  return c.json({ ok: true });
});
campaigns.post("/:id/pause", async (c) => {
  await run(
    c.env,
    `UPDATE campaigns SET status='paused',pause_reason='Paused by you',updated_at=? WHERE id=? AND status='sending'`,
    now(),
    c.req.param("id"),
  );
  return c.json({ ok: true });
});
campaigns.post("/:id/resume", async (c) => {
  await startCampaign(c.env, c.req.param("id"));
  await run(
    c.env,
    `UPDATE deliveries SET queued_at=NULL WHERE campaign_id=? AND status='queued'`,
    c.req.param("id"),
  );
  await dispatch(c.env);
  return c.json({ ok: true });
});
campaigns.post("/:id/duplicate", async (c) => {
  const draft = await campaign(c.env, c.req.param("id"));
  const newId = id();
  await run(
    c.env,
    `INSERT INTO campaigns(id,newsletter_id,subject,preview_text,format,body,archive_slug,archive_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    newId,
    draft.newsletter_id,
    `${draft.subject} (copy)`,
    draft.preview_text,
    draft.format,
    draft.body,
    `issue-${newId.slice(0, 8)}`,
    draft.archive_enabled,
    now(),
    now(),
  );
  return c.json({ id: newId }, 201);
});
campaigns.delete("/:id", async (c) => {
  const draft = await campaign(c.env, c.req.param("id"));
  if (!["draft", "scheduled"].includes(draft.status))
    fail("Sent campaigns cannot be deleted", 409);
  await run(
    c.env,
    `UPDATE campaigns SET status='canceled',updated_at=? WHERE id=? AND status IN ('draft','scheduled')`,
    now(),
    draft.id,
  );
  return c.json({ ok: true });
});
