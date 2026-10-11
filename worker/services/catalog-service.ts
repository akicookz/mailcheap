import type { Bindings } from "../types";
import { one } from "../db/query";
import { fail } from "../lib/http";
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
