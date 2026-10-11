import { z } from "zod";
import { fail } from "./lib/http";
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
