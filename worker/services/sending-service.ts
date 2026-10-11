import { type Bindings, type Row } from "../types";
import { all, one, run } from "../db/query";
import { id, now, sending, appUrl } from "../lib/config";
import { fail } from "../lib/http";
import { newsletter, campaign } from "./catalog-service";
import { limit } from "../lib/rate-limit";
import { prepareEmail, validateContent } from "./email-service";
import { signLink } from "../auth";
import { escapeHtml } from "../../shared/render-email.js";

export async function startCampaign(
  env: Bindings,
  campaignId: string,
  audienceLimit?: number,
) {
  if (!sending(env))
    fail(
      "Sending is disabled. Finish your sender setup before enabling it.",
      409,
    );
  const draft = await campaign(env, campaignId);
  const list = await newsletter(env, draft.newsletter_id);
  if (!["draft", "scheduled", "paused"].includes(draft.status))
    fail("This campaign has already started", 409);
  validateContent(draft, list);
  if (draft.status === "paused") {
    await run(
      env,
      `UPDATE campaigns SET status='sending',pause_reason=NULL,updated_at=? WHERE id=? AND status='paused'`,
      now(),
      campaignId,
    );
    await dispatch(env);
    return;
  }
  const snapshot = JSON.stringify({ draft, list });
  const cutoff =
    list.cleanup_days >= 30
      ? new Date(Date.now() - list.cleanup_days * 86400000).toISOString()
      : "";
  // Both audience insertion and state transition occur in one D1 transaction. Stale simultaneous clicks cannot overwrite the snapshot.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE campaigns SET status='sending',snapshot=?,started_at=?,updated_at=?,audience_limit=? WHERE id=? AND status IN ('draft','scheduled')`,
    ).bind(snapshot, now(), now(), audienceLimit || null, campaignId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO deliveries(id,campaign_id,contact_id,newsletter_id,email,created_at)
     SELECT lower(hex(randomblob(16))),?,c.id,c.newsletter_id,c.email,? FROM contacts c
     WHERE c.newsletter_id=? AND c.status='active' AND NOT EXISTS(SELECT 1 FROM suppressions s WHERE s.email=c.email)
     AND (?='' OR c.last_sent_at IS NULL OR COALESCE(c.last_engaged_at,c.created_at)>=?)
     AND EXISTS(SELECT 1 FROM campaigns WHERE id=? AND status='sending' AND snapshot=?)
     ORDER BY c.last_engaged_at DESC,c.created_at DESC LIMIT ?`,
    ).bind(
      campaignId,
      now(),
      list.id,
      cutoff,
      cutoff,
      campaignId,
      snapshot,
      audienceLimit || -1,
    ),
  ]);
  const count = await one(
    env,
    "SELECT count(*) AS n FROM deliveries WHERE campaign_id=? AND kind='campaign'",
    campaignId,
  );
  if (!count?.n) {
    await run(
      env,
      `UPDATE campaigns SET status='draft',snapshot=NULL,started_at=NULL WHERE id=? AND status='sending'`,
      campaignId,
    );
    fail("No active, eligible subscribers to send to");
  }
  await dispatch(env);
}

export async function dispatch(env: Bindings) {
  if (!sending(env)) return;
  // A short outbox lease makes a crash between DB write and queue publication recoverable. Repeated publications are harmless.
  const pending = await all(
    env,
    `SELECT d.id FROM deliveries d LEFT JOIN campaigns c ON c.id=d.campaign_id
 WHERE d.status='queued' AND (d.queued_at IS NULL OR d.queued_at<?)
 AND (d.kind!='campaign' OR c.status='sending') ORDER BY d.created_at LIMIT 100`,
    new Date(Date.now() - 10 * 60000).toISOString(),
  );
  for (const item of pending) {
    const claim = await run(
      env,
      `UPDATE deliveries SET queued_at=? WHERE id=? AND status='queued' AND (queued_at IS NULL OR queued_at<?)`,
      now(),
      item.id,
      new Date(Date.now() - 10 * 60000).toISOString(),
    );
    if (!claim.meta.changes) continue;
    try {
      await env.SEND_QUEUE.send({ deliveryId: item.id });
    } catch (error) {
      await run(
        env,
        `UPDATE deliveries SET queued_at=NULL WHERE id=? AND status='queued'`,
        item.id,
      );
      throw error;
    }
  }
}

export async function queueSignup(env: Bindings, list: Row, contact: Row) {
  if (!sending(env)) return;
  const kind = contact.status === "pending" ? "confirmation" : "welcome";
  if (kind === "welcome" && (!list.welcome_subject || !list.welcome_body))
    return;
  if (
    kind === "confirmation" &&
    (await limit(env, `signup-mail:${kind}:${contact.id}`, 1, 600))
  )
    return;
  if (
    kind === "welcome" &&
    (await one(
      env,
      `SELECT id FROM deliveries WHERE contact_id=? AND kind='welcome'`,
      contact.id,
    ))
  )
    return;
  const confirmToken = await signLink(env, "confirm", {
    contact: contact.id,
    until: String(Date.now() + 7 * 86400000),
  });
  const draft =
    kind === "confirmation"
      ? {
          subject: `Confirm your subscription to ${list.name}`,
          format: "html",
          preview_text: "One click to confirm your email address.",
          body: `<h1>Confirm your subscription</h1><p>You asked to receive ${escapeHtml(list.name)}.</p><p><a href="${appUrl(env)}/public/confirm?token=${confirmToken}">Confirm my subscription</a></p><p>If this was not you, ignore this email.</p>`,
        }
      : {
          subject: list.welcome_subject,
          format: "markdown",
          body: list.welcome_body,
          preview_text: "",
        };
  await run(
    env,
    `INSERT OR IGNORE INTO deliveries(id,newsletter_id,contact_id,email,kind,content,created_at) VALUES (?,?,?,?,?,?,?)`,
    id(),
    list.id,
    contact.id,
    contact.email,
    kind,
    JSON.stringify({ draft, list }),
    now(),
  );
  await dispatch(env);
}

export async function queueTest(env: Bindings, campaignId: string) {
  if (!sending(env)) fail("Sending is disabled", 409);
  const draft = await campaign(env, campaignId);
  const list = await newsletter(env, draft.newsletter_id);
  validateContent(draft, list);
  if (await limit(env, "test-email", 5, 600))
    fail("Wait before sending another test", 429);
  const deliveryId = id();
  await run(
    env,
    `INSERT INTO deliveries(id,campaign_id,newsletter_id,email,kind,content,created_at) VALUES (?,?,?,?,'test',?,?)`,
    deliveryId,
    campaignId,
    list.id,
    env.ADMIN_EMAIL,
    JSON.stringify({
      draft: { ...draft, subject: `[Test] ${draft.subject}` },
      list,
    }),
    now(),
  );
  await dispatch(env);
  return { delivery_id: deliveryId, recipient: env.ADMIN_EMAIL };
}

export async function settle(env: Bindings, campaignId: string) {
  const counts = await one(
    env,
    `SELECT SUM(sent_at IS NOT NULL) AS sent,SUM(status='bounced') AS bounced,SUM(status='complained') AS complained,SUM(status='uncertain') AS uncertain,SUM(status='failed') AS failed FROM deliveries WHERE campaign_id=? AND kind='campaign'`,
    campaignId,
  );
  const unhealthy =
    counts &&
    ((counts.sent >= 100 &&
      (counts.bounced / counts.sent > 0.02 ||
        counts.complained / counts.sent > 0.0008)) ||
      counts.uncertain > 0 ||
      counts.failed >= 5);
  if (unhealthy) {
    await run(
      env,
      `UPDATE campaigns SET status='paused',pause_reason=?,updated_at=? WHERE id=? AND status='sending'`,
      counts!.uncertain
        ? "Delivery outcome needs review"
        : "Bounce, complaint, or failure threshold reached",
      now(),
      campaignId,
    );
    return;
  }
  await run(
    env,
    `UPDATE campaigns SET status='sent',sent_at=COALESCE(sent_at,?),updated_at=? WHERE id=? AND status='sending' AND NOT EXISTS(SELECT 1 FROM deliveries WHERE campaign_id=? AND kind='campaign' AND status IN ('queued','sending','uncertain'))`,
    now(),
    now(),
    campaignId,
    campaignId,
  );
}

export async function consume(
  batch: MessageBatch<{ deliveryId: string }>,
  env: Bindings,
) {
  for (const message of batch.messages) {
    if (!message.body?.deliveryId) {
      message.ack();
      continue;
    }
    const delivery = await one(
      env,
      "SELECT * FROM deliveries WHERE id=?",
      message.body.deliveryId,
    );
    if (!delivery || delivery.status !== "queued") {
      message.ack();
      continue;
    }
    if (!sending(env)) {
      await run(
        env,
        "UPDATE deliveries SET queued_at=NULL WHERE id=?",
        delivery.id,
      );
      message.ack();
      continue;
    }
    if (delivery.kind === "campaign") {
      await settle(env, delivery.campaign_id);
      if (
        !(await one(
          env,
          `SELECT id FROM campaigns WHERE id=? AND status='sending'`,
          delivery.campaign_id,
        ))
      ) {
        message.ack();
        continue;
      }
    }
    // Signup bursts wait in the durable outbox instead of losing confirmation or welcome mail.
    if (
      ["confirmation", "welcome"].includes(delivery.kind) &&
      (await limit(env, `signup-list:${delivery.newsletter_id}`, 100, 600))
    ) {
      message.retry({ delaySeconds: 600 });
      continue;
    }
    const content = delivery.content
      ? JSON.parse(delivery.content)
      : JSON.parse((await campaign(env, delivery.campaign_id)).snapshot);
    let email;
    try {
      email = await prepareEmail(env, delivery, content.draft, content.list);
    } catch (error) {
      await run(
        env,
        `UPDATE deliveries SET status='failed',error=? WHERE id=? AND status='queued'`,
        String(error).slice(0, 400),
        delivery.id,
      );
      message.ack();
      continue;
    }
    // Check eligibility in the same statement as the claim; queued data cannot override a new unsubscribe.
    const claim = await run(
      env,
      `UPDATE deliveries SET status='sending',attempted_at=?,attempts=attempts+1 WHERE id=? AND status='queued'
     AND NOT EXISTS(SELECT 1 FROM suppressions WHERE email=deliveries.email)
     AND (kind='test' OR EXISTS(SELECT 1 FROM contacts WHERE id=deliveries.contact_id AND status=CASE WHEN deliveries.kind='confirmation' THEN 'pending' ELSE 'active' END))
     AND (kind!='campaign' OR EXISTS(SELECT 1 FROM campaigns WHERE id=deliveries.campaign_id AND status='sending'))`,
      now(),
      delivery.id,
    );
    if (!claim.meta.changes) {
      const activeCampaign =
        delivery.kind !== "campaign" ||
        (await one(
          env,
          `SELECT id FROM campaigns WHERE id=? AND status='sending'`,
          delivery.campaign_id,
        ));
      if (activeCampaign)
        await run(
          env,
          `UPDATE deliveries SET status='suppressed',error='Subscriber is no longer eligible' WHERE id=? AND status='queued'`,
          delivery.id,
        );
      message.ack();
      continue;
    }
    try {
      const result = await env.EMAIL.send(email);
      if (!result?.messageId)
        throw new Error("Email service returned no message ID");
      await run(
        env,
        `UPDATE deliveries SET status=CASE WHEN status='sending' THEN 'accepted' ELSE status END,provider_id=?,sent_at=?,error=NULL WHERE id=?`,
        result.messageId,
        now(),
        delivery.id,
      );
      if (delivery.contact_id)
        await run(
          env,
          "UPDATE contacts SET last_sent_at=? WHERE id=?",
          now(),
          delivery.contact_id,
        );
      if (delivery.kind === "test")
        await run(
          env,
          "UPDATE campaigns SET test_sent_at=? WHERE id=?",
          now(),
          delivery.campaign_id,
        );
      message.ack();
    } catch (error) {
      const code = String((error as { code?: string }).code || "");
      const detail = `${code} ${String(error)}`.slice(0, 500);
      if (["E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED"].includes(code)) {
        await run(
          env,
          `UPDATE deliveries SET status='queued',error=? WHERE id=? AND status='sending'`,
          detail,
          delivery.id,
        );
        if (code === "E_DAILY_LIMIT_EXCEEDED")
          await run(
            env,
            `UPDATE campaigns SET status='paused',pause_reason='Cloudflare daily quota reached' WHERE status='sending'`,
          );
        message.retry({
          delaySeconds: code === "E_DAILY_LIMIT_EXCEEDED" ? 3600 : 60,
        });
      } else {
        const definitive = [
          "E_VALIDATION_ERROR",
          "E_FIELD_MISSING",
          "E_SENDER_NOT_VERIFIED",
          "E_RECIPIENT_NOT_ALLOWED",
          "E_RECIPIENT_SUPPRESSED",
          "E_SENDER_DOMAIN_NOT_AVAILABLE",
          "E_CONTENT_TOO_LARGE",
          "E_HEADER_NOT_ALLOWED",
          "E_HEADER_VALUE_INVALID",
          "E_HEADER_USE_API_FIELD",
          "E_HEADER_VALUE_TOO_LONG",
          "E_HEADERS_TOO_LARGE",
          "E_HEADERS_TOO_MANY",
          "E_HEADER_NAME_INVALID",
        ].includes(code);
        const status =
          code === "E_RECIPIENT_SUPPRESSED"
            ? "suppressed"
            : definitive
              ? "failed"
              : "uncertain";
        await run(
          env,
          `UPDATE deliveries SET status=?,error=? WHERE id=? AND status='sending'`,
          status,
          detail,
          delivery.id,
        );
        if (delivery.kind === "campaign")
          await run(
            env,
            `UPDATE campaigns SET status='paused',pause_reason=?,updated_at=? WHERE id=? AND status='sending'`,
            detail,
            now(),
            delivery.campaign_id,
          );
        message.ack();
      }
    }
    if (delivery.kind === "campaign") await settle(env, delivery.campaign_id);
    // This consumer is configured for one concurrent invocation: the account rate is shared by all campaign and signup messages.
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.ceil(
          1000 / Math.max(1, Math.min(10, Number(env.SEND_PER_SECOND) || 1)),
        ),
      ),
    );
  }
}

export async function tick(env: Bindings) {
  await run(
    env,
    `UPDATE deliveries SET status='uncertain',error='Worker stopped during delivery; check provider logs before retrying' WHERE status='sending' AND attempted_at<?`,
    new Date(Date.now() - 15 * 60000).toISOString(),
  );
  await run(env, "DELETE FROM sessions WHERE expires_at<?", Date.now());
  await run(
    env,
    "DELETE FROM rate_limits WHERE expires_at<?",
    Math.floor(Date.now() / 1000) - 86400,
  );
  if (!sending(env)) return;
  const due = await all(
    env,
    `SELECT id,audience_limit FROM campaigns WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 10`,
    now(),
  );
  for (const item of due) {
    try {
      await startCampaign(env, item.id, item.audience_limit);
    } catch (error) {
      await run(
        env,
        `UPDATE campaigns SET status='draft',pause_reason=? WHERE id=? AND status='scheduled'`,
        String(error).slice(0, 400),
        item.id,
      );
    }
  }
  for (const item of await all(
    env,
    `SELECT id FROM campaigns WHERE status='sending' LIMIT 100`,
  ))
    await settle(env, item.id);
  await dispatch(env);
}
