import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export type Bindings = Env & {
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  LINK_SECRET: string;
};
export type AppEnv = { Bindings: Bindings };
export type Row = Record<string, any>;
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export function fail(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503 = 400,
): never {
  throw new HTTPException(status, { message });
}
export const one = <T = Row>(env: Bindings, sql: string, ...args: any[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .first<T>();
export const all = async <T = Row>(
  env: Bindings,
  sql: string,
  ...args: any[]
) =>
  (
    await env.DB.prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
export const run = (env: Bindings, sql: string, ...args: any[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const newsletterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  from_name: z.string().trim().max(100).default(""),
  from_email: emailSchema,
  reply_to: z.union([emailSchema, z.literal("")]).default(""),
  postal_address: z.string().trim().max(500).default(""),
  description: z.string().max(1000).default(""),
  require_confirmation: z.boolean().default(true),
  welcome_subject: z.string().max(200).default(""),
  welcome_body: z.string().max(50000).default(""),
  cleanup_days: z
    .number()
    .int()
    .min(0)
    .max(3650)
    .refine((n) => n === 0 || n >= 30, "Use 0 or at least 30 days")
    .default(0),
});
export const campaignSchema = z.object({
  subject: z.string().max(200),
  preview_text: z.string().max(300).default(""),
  format: z.enum(["rich", "html", "markdown"]).default("rich"),
  body: z.string().max(300000),
  archive_enabled: z.boolean().default(true),
});
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    return fail(
      result.error.issues
        .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
        .join("; "),
    );
  return result.data;
}
export async function readJson(request: Request) {
  const bytes = await readLimited(request, 400000);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail("Invalid JSON");
  }
}
export async function readLimited(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    return fail("Request is too large", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return fail("Request is too large", 413);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export async function limit(
  env: Bindings,
  key: string,
  maximum: number,
  seconds: number,
) {
  const time = Math.floor(Date.now() / 1000);
  const row = await one(
    env,
    `INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
 expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
    key,
    time + seconds,
    time,
    time,
  );
  return Number(row?.count) > maximum;
}
export function appUrl(env: Bindings) {
  return env.APP_URL.replace(/\/$/, "");
}
export const local = (env: Bindings) => env.LOCAL_PREVIEW === "true";
export const sending = (env: Bindings) => env.SENDING_ENABLED === "true";
export async function campaign(env: Bindings, campaignId: string) {
  return (
    (await one(env, "SELECT * FROM campaigns WHERE id=?", campaignId)) ??
    fail("Campaign not found", 404)
  );
}
export async function newsletter(env: Bindings, newsletterId: string) {
  return (
    (await one(env, "SELECT * FROM newsletters WHERE id=?", newsletterId)) ??
    fail("Newsletter not found", 404)
  );
}
