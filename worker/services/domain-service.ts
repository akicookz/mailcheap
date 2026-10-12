import { z } from "zod";
import type { Bindings } from "../types";
import { fail } from "../lib/http";
import { local } from "../lib/config";
import { connectionStatus, cloudflareAccessToken } from "./cloudflare-oauth";

export const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "Enter a domain such as news.example.com, without https:// or an email address.",
  );
const identifier = z.string().regex(/^[a-f0-9]{32}$/i);
const zoneSchema = z.object({ id: identifier, name: z.string() });
const zoneDetails = zoneSchema.extend({
  status: z.string(),
  name_servers: z.array(z.string()).default([]),
});
const senderSchema = z.object({
  name: z.string(),
  tag: identifier,
  enabled: z.boolean(),
});
const recordSchema = z.object({
  type: z.string(),
  name: z.string(),
  content: z.string(),
  priority: z.number().optional(),
  ttl: z.number().optional(),
});
type DnsRecord = z.infer<typeof recordSchema>;
const envelope = z.object({
  success: z.boolean(),
  result: z.unknown(),
  errors: z.array(z.object({ code: z.number().optional() })).optional(),
  result_info: z.object({ total_pages: z.number().optional() }).optional(),
});

async function cloudflare<T>(
  env: Bindings,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
) {
  const token = await cloudflareAccessToken(env);
  let response: Response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return fail(
      body === undefined
        ? "Cloudflare could not be reached. Try again."
        : "Cloudflare did not respond. Refresh your domains before trying setup again.",
      503,
    );
  }
  if (response.status === 401 || response.status === 403)
    fail(
      "Cloudflare denied access. Reconnect your account and allow Zone read and Email Sending access.",
      503,
    );
  if (response.status === 429)
    fail(
      "Cloudflare is receiving too many requests. Wait a minute and try again.",
      429,
    );
  const parsed = envelope.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success || !parsed.data.success) {
    const code = parsed.success ? parsed.data.errors?.[0]?.code : undefined;
    fail(
      `Cloudflare could not complete the request${code ? ` (code ${code})` : ""}. Check Email Sending access and the domain in your Cloudflare dashboard.`,
      503,
    );
  }
  const result = schema.safeParse(parsed.data.result);
  if (!result.success)
    fail("Cloudflare returned an unexpected response. Try again later.", 503);
  return { result: result.data, pages: parsed.data.result_info?.total_pages };
}

async function listSenders(env: Bindings, zone: z.infer<typeof zoneSchema>) {
  const { result } = await cloudflare(
    env,
    `/zones/${zone.id}/email/sending/subdomains`,
    z.array(senderSchema),
  );
  return result.map(({ name, enabled }) => ({
    name,
    enabled,
    zone: zone.name,
  }));
}

export async function listDomains(env: Bindings) {
  const config = await connectionStatus(env);
  if (!config.configured) return { ...config, domains: [] };
  const zones: z.infer<typeof zoneSchema>[] = [];
  for (let page = 1; ; page++) {
    if (page > 100)
      fail("Too many zones to load. Narrow the API token's zone scope.", 503);
    const data = await cloudflare(
      env,
      `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/zones?page=${page}&per_page=50`,
      z.array(zoneSchema),
    );
    zones.push(...data.result);
    if (data.pages !== undefined ? page >= data.pages : data.result.length < 50)
      break;
  }
  const domains: { name: string; enabled: boolean; zone: string }[] = [];
  for (let i = 0; i < zones.length; i += 5) {
    const batch = await Promise.all(
      zones.slice(i, i + 5).map((zone) => listSenders(env, zone)),
    );
    domains.push(...batch.flat());
  }
  return {
    ...config,
    domains: domains.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function findZone(env: Bindings, name: string) {
  // Resolve the longest matching zone in this account. Never accept a client zone ID.
  const parts = name.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const query = new URLSearchParams({
      name: parts.slice(i).join("."),
      "account.id": env.CLOUDFLARE_ACCOUNT_ID || "",
    });
    const { result } = await cloudflare(
      env,
      `/zones?${query}`,
      z.array(zoneDetails),
    );
    if (result.length) return result[0];
  }
  return null;
}

export async function lookupDomain(env: Bindings, name: string) {
  if (!(await connectionStatus(env)).configured)
    return { name, mode: "unconnected" as const };
  const zone = await findZone(env, name);
  if (!zone) return { name, mode: "external" as const };
  return {
    name,
    mode:
      zone.status === "active" ? ("managed" as const) : ("pending" as const),
    zone: zone.name,
    nameservers: zone.name_servers,
  };
}

export async function configureDomain(env: Bindings, name: string) {
  if (local(env))
    fail(
      "DNS changes are disabled in local preview. Configure domains from the deployed app.",
      403,
    );
  await cloudflareAccessToken(env);
  const zone = await findZone(env, name);
  if (!zone)
    fail(
      "Connect this domain to Cloudflare DNS in the configured account first.",
      409,
    );
  if (zone.status !== "active")
    fail(
      "Activate this zone in Cloudflare before configuring email sending.",
      409,
    );
  const { result } = await cloudflare(
    env,
    `/zones/${zone.id}/email/sending/subdomains`,
    senderSchema,
    { name },
  );
  return { name: result.name, enabled: result.enabled, zone: zone.name };
}

const dnsResponse = z.object({
  Status: z.number(),
  TC: z.boolean().optional(),
  Answer: z.array(z.object({ type: z.number(), data: z.string() })).default([]),
});
const dnsTypes: Record<string, number> = { MX: 15, TXT: 16, CNAME: 5 };
const host = (value: string) => value.toLowerCase().replace(/\.$/, "");
function txt(value: string) {
  // DNS TXT answers can contain multiple quoted character strings (notably DKIM).
  const chunks = value.match(/"(?:[^"\\]|\\.)*"/g);
  if (!chunks) return value;
  return chunks
    .map((chunk) =>
      chunk
        .slice(1, -1)
        .replace(/\\(\d{3}|.)/g, (_, escaped: string) =>
          /^\d{3}$/.test(escaped)
            ? String.fromCharCode(Number(escaped))
            : escaped,
        ),
    )
    .join("");
}
async function checkRecord(
  record: DnsRecord,
): Promise<"published" | "pending" | "unknown"> {
  const type = dnsTypes[record.type];
  if (!type) return "unknown";
  try {
    const query = new URLSearchParams({ name: record.name, type: record.type });
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?${query}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return "unknown";
    const data = dnsResponse.parse(await response.json());
    if (data.TC || (data.Status !== 0 && data.Status !== 3)) return "unknown";
    const matches = data.Answer.filter((answer) => answer.type === type).some(
      (answer) => {
        if (record.type === "TXT")
          return txt(answer.data) === txt(record.content);
        if (record.type === "MX") {
          const [priority, target] = answer.data.trim().split(/\s+/);
          return (
            Number(priority) === record.priority &&
            host(target || "") === host(record.content)
          );
        }
        return host(answer.data) === host(record.content);
      },
    );
    return matches ? "published" : "pending";
  } catch {
    return "unknown";
  }
}

export async function domainDetails(
  env: Bindings,
  name: string,
  verify: boolean,
) {
  const zone = await findZone(env, name);
  if (!zone)
    fail(
      "This domain is not visible in the connected Cloudflare account.",
      404,
    );
  const { result: senders } = await cloudflare(
    env,
    `/zones/${zone.id}/email/sending/subdomains`,
    z.array(senderSchema),
  );
  const sender = senders.find((item) => item.name === name);
  if (!sender)
    fail("This domain has not been configured for Email Sending.", 404);
  const { result: records } = await cloudflare(
    env,
    `/zones/${zone.id}/email/sending/subdomains/${sender.tag}/dns`,
    z.array(recordSchema),
  );
  const checked: (DnsRecord & { status: string })[] = [];
  for (let i = 0; i < records.length; i += 4) {
    checked.push(
      ...(await Promise.all(
        records.slice(i, i + 4).map(async (record) => ({
          ...record,
          status: verify ? await checkRecord(record) : "unchecked",
        })),
      )),
    );
  }
  return {
    name: sender.name,
    enabled: sender.enabled,
    zone: zone.name,
    records: checked,
    checked_at: verify ? new Date().toISOString() : null,
  };
}
