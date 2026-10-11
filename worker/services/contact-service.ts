import { type Bindings, type Row } from "../types";
import { all, one, run } from "../db/query";
import { id, now } from "../lib/config";
import { fail } from "../lib/http";
import { emailSchema, parse } from "../validation";

export async function addContact(
  env: Bindings,
  list: Row,
  input: {
    email: string;
    source?: string;
    confirmed?: boolean;
    resubscribe?: boolean;
    initialStatus?:
      "active" | "dormant" | "unsubscribed" | "bounced" | "complained";
  },
) {
  const email = parse(emailSchema, input.email);
  const suppressed = await one(
    env,
    "SELECT reason FROM suppressions WHERE email=?",
    email,
  );
  const existing = await one(
    env,
    "SELECT * FROM contacts WHERE newsletter_id=? AND email=?",
    list.id,
    email,
  );
  if (suppressed && !input.initialStatus)
    return { contact: existing, created: false, suppressed: true };
  const importedStatus = suppressed
    ? { complaint: "complained", bounce: "bounced", manual: "unsubscribed" }[
        suppressed.reason as string
      ] || "unsubscribed"
    : input.initialStatus;
  const status =
    importedStatus ??
    (input.confirmed || !list.require_confirmation ? "active" : "pending");
  if (existing) {
    if (
      input.resubscribe &&
      ["unsubscribed", "dormant"].includes(existing.status)
    ) {
      await run(
        env,
        `UPDATE contacts SET status=?, unsubscribed_at=NULL WHERE id=? AND status IN ('unsubscribed','dormant')`,
        status,
        existing.id,
      );
      existing.status = status;
    }
    return { contact: existing, created: false, suppressed: false };
  }
  const contact = {
    id: id(),
    newsletter_id: list.id,
    email,
    status,
    source: input.source || "signup",
    created_at: now(),
  };
  const inserted = await run(
    env,
    `INSERT INTO contacts(id,newsletter_id,email,status,source,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(newsletter_id,email) DO NOTHING`,
    ...Object.values(contact),
  );
  return {
    contact: await one(
      env,
      "SELECT * FROM contacts WHERE newsletter_id=? AND email=?",
      list.id,
      email,
    ),
    created: Boolean(inserted.meta.changes),
    suppressed: false,
  };
}

export async function unsubscribe(env: Bindings, contactId: string) {
  await run(
    env,
    `UPDATE contacts SET status='unsubscribed',unsubscribed_at=? WHERE id=? AND status IN ('active','pending','dormant')`,
    now(),
    contactId,
  );
  await run(
    env,
    `UPDATE deliveries SET status='suppressed',error='Unsubscribed before sending' WHERE contact_id=? AND status='queued' AND kind!='confirmation'`,
    contactId,
  );
}

export async function suppress(
  env: Bindings,
  email: string,
  reason: "bounce" | "complaint" | "manual",
) {
  const status =
    reason === "complaint"
      ? "complained"
      : reason === "bounce"
        ? "bounced"
        : "unsubscribed";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO suppressions(email,reason,created_at) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET reason=CASE WHEN reason='complaint' THEN reason ELSE excluded.reason END`,
    ).bind(email, reason, now()),
    env.DB.prepare(
      `UPDATE contacts SET status=CASE WHEN status='complained' THEN status ELSE ? END WHERE email=?`,
    ).bind(status, email),
    env.DB.prepare(
      `UPDATE deliveries SET status='suppressed',error=? WHERE email=? AND status='queued'`,
    ).bind(reason, email),
  ]);
}

export async function cleanList(
  env: Bindings,
  listId: string,
  days: number,
  apply: boolean,
) {
  if (!Number.isInteger(days) || days < 30 || days > 3650)
    fail("Choose between 30 and 3650 inactive days");
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const condition = `newsletter_id=? AND status='active' AND last_sent_at IS NOT NULL AND COALESCE(last_engaged_at,created_at)<?`;
  const result = await one(
    env,
    `SELECT count(*) AS count FROM contacts WHERE ${condition}`,
    listId,
    cutoff,
  );
  if (apply)
    await run(
      env,
      `UPDATE contacts SET status='dormant' WHERE ${condition}`,
      listId,
      cutoff,
    );
  return { count: result?.count || 0, applied: apply };
}

export async function contactList(
  env: Bindings,
  query: Record<string, string>,
) {
  const where = ["1=1"];
  const args: string[] = [];
  if (query.newsletter_id) {
    where.push("newsletter_id=?");
    args.push(query.newsletter_id);
  }
  if (query.status) {
    where.push("status=?");
    args.push(query.status);
  }
  if (query.search) {
    where.push("email LIKE ?");
    args.push(`%${query.search.slice(0, 254)}%`);
  }
  const offset = Math.max(0, Number.parseInt(query.offset || "0") || 0);
  const [rows, total] = await Promise.all([
    all(
      env,
      `SELECT * FROM contacts WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id LIMIT 100 OFFSET ?`,
      ...args,
      offset,
    ),
    one(
      env,
      `SELECT count(*) AS count FROM contacts WHERE ${where.join(" AND ")}`,
      ...args,
    ),
  ]);
  return { rows, total: total?.count || 0, offset };
}
