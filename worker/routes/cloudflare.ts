import { Hono } from "hono";
import type { AppEnv } from "../types";
import { sessionHash } from "../auth";
import { fail } from "../lib/http";
import { limit } from "../lib/rate-limit";
import {
  beginOAuth,
  finishOAuth,
  connectionStatus,
  disconnectCloudflare,
} from "../services/cloudflare-oauth";

export const cloudflare = new Hono<AppEnv>();
cloudflare.get("/", async (c) => c.json(await connectionStatus(c.env)));
cloudflare.post("/connect", async (c) => {
  const session = await sessionHash(c);
  if (await limit(c.env, `cloudflare-connect:${session}`, 10, 600))
    fail("Wait before starting another Cloudflare connection.", 429);
  return c.json(await beginOAuth(c.env, session));
});
cloudflare.get("/callback", async (c) => {
  const result = await finishOAuth(c.env, await sessionHash(c), c.req.query());
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(`/domains?cloudflare=${result}`, 303);
});
cloudflare.post("/disconnect", async (c) =>
  c.json(await disconnectCloudflare(c.env)),
);
