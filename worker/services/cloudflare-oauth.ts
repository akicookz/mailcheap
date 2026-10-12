import { z } from "zod";
import type { Bindings } from "../types";
import type { CloudflareConnection } from "../db/cloudflare.schema";
import { one, run } from "../db/query";
import { hash, randomToken } from "../auth";
import { local, appUrl, now } from "../lib/config";
import { fail, readLimited } from "../lib/http";
import { seal, unseal } from "../lib/secret-box";

export const oauthScopes = [
  "zone.read",
  "email-sending.write",
  "offline_access",
];
const oauthBase = "https://dash.cloudflare.com/oauth2";
const callbackPath = "/api/admin/cloudflare/callback";
const accountId = z.string().regex(/^[a-f0-9]{32}$/i);
const credentialsSchema = z.object({
  access_token: z.string().min(1).max(16000),
  refresh_token: z.string().min(1).max(16000),
});
const tokenSchema = credentialsSchema.extend({
  refresh_token: z.string().min(1).max(16000).optional(),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive().max(31536000),
  scope: z.string().optional(),
});
const pendingSchema = z.object({
  verifier: z.string(),
  account: z.string(),
  client: z.string(),
  redirect: z.string(),
  revision: z.string(),
});
const purpose = (env: Bindings) =>
  `cloudflare:${env.CLOUDFLARE_ACCOUNT_ID}:${env.CLOUDFLARE_OAUTH_CLIENT_ID}`;
export const callbackUrl = (env: Bindings) => `${appUrl(env)}${callbackPath}`;
export function oauthReady(env: Bindings) {
  return !!(
    accountId.safeParse(env.CLOUDFLARE_ACCOUNT_ID).success &&
    env.CLOUDFLARE_OAUTH_CLIENT_ID &&
    env.CLOUDFLARE_OAUTH_CLIENT_SECRET
  );
}
export const oauthMode = (env: Bindings) => !!env.CLOUDFLARE_OAUTH_CLIENT_ID;
async function row(env: Bindings) {
  return one<CloudflareConnection>(
    env,
    "SELECT * FROM cloudflare_connection WHERE id=1",
  );
}
function matches(env: Bindings, connection: CloudflareConnection) {
  return (
    connection.account_id === env.CLOUDFLARE_ACCOUNT_ID &&
    connection.client_id === env.CLOUDFLARE_OAUTH_CLIENT_ID
  );
}
export async function connectionStatus(env: Bindings) {
  const base = {
    local_preview: local(env),
    oauth_ready: oauthReady(env),
    callback_url: callbackUrl(env),
    account_id: env.CLOUDFLARE_ACCOUNT_ID || null,
  };
  // A configured OAuth client takes precedence. Disconnect must not fall back to a static token.
  if (!oauthMode(env))
    return {
      ...base,
      configured: !!(
        env.CLOUDFLARE_API_TOKEN &&
        accountId.safeParse(env.CLOUDFLARE_ACCOUNT_ID).success
      ),
      method: env.CLOUDFLARE_API_TOKEN ? "api_token" : "oauth",
      status: env.CLOUDFLARE_API_TOKEN ? "connected" : "disconnected",
      connected_at: null,
    };
  const connection = await row(env);
  const connected = !!(
    oauthReady(env) &&
    connection &&
    matches(env, connection) &&
    connection.status === "active"
  );
  return {
    ...base,
    configured: connected,
    method: "oauth",
    connected_at: connection?.connected_at || null,
    status: connected
      ? "connected"
      : connection && connection.status !== "disconnected"
        ? "reconnect"
        : "disconnected",
  };
}
async function readCredentials(
  env: Bindings,
  connection: CloudflareConnection,
) {
  try {
    return credentialsSchema.parse(
      JSON.parse(await unseal(env, connection.credentials, purpose(env))),
    );
  } catch {
    fail(
      "Reconnect Cloudflare. The saved connection can no longer be opened.",
      503,
    );
  }
}
async function tokenRequest(env: Bindings, params: URLSearchParams) {
  if (!oauthReady(env))
    fail("Cloudflare OAuth is not configured on this Worker.", 503);
  params.set("client_id", env.CLOUDFLARE_OAUTH_CLIENT_ID!);
  params.set("client_secret", env.CLOUDFLARE_OAUTH_CLIENT_SECRET!);
  const response = await fetch(`${oauthBase}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  // Never pass upstream bodies or token values into logs or browser errors.
  if (!response.ok)
    fail("Cloudflare could not authorize this connection. Connect again.", 503);
  const body = await readLimited(
    new Request("https://oauth-response.invalid", {
      method: "POST",
      body: response.body,
    }),
    64000,
  );
  const parsed = tokenSchema.safeParse(
    JSON.parse(new TextDecoder().decode(body)),
  );
  if (!parsed.success)
    fail(
      "Cloudflare returned an invalid authorization response. Connect again.",
      503,
    );
  if (parsed.data.scope) {
    const scopes = parsed.data.scope.split(/\s+/);
    if (oauthScopes.some((scope) => !scopes.includes(scope)))
      fail(
        "Cloudflare did not grant all required permissions. Connect again.",
        503,
      );
  }
  return parsed.data;
}
async function revoke(env: Bindings, token: string, hint: string) {
  try {
    const response = await fetch(`${oauthBase}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.CLOUDFLARE_OAUTH_CLIENT_ID!,
        client_secret: env.CLOUDFLARE_OAUTH_CLIENT_SECRET!,
        token,
        token_type_hint: hint,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    return response.ok;
  } catch {
    return false;
  }
}
export async function beginOAuth(env: Bindings, session: string) {
  if (!oauthReady(env))
    fail(
      "Register the Cloudflare OAuth client and add its credentials to this Worker first.",
      503,
    );
  const redirect = new URL(callbackUrl(env));
  if (
    redirect.protocol !== "https:" &&
    !(local(env) && ["localhost", "127.0.0.1"].includes(redirect.hostname))
  )
    fail("Cloudflare OAuth requires an HTTPS app URL.", 503);
  await run(
    env,
    "INSERT OR IGNORE INTO cloudflare_connection(id,account_id,client_id,credentials,expires_at,connected_at,status,revision) VALUES (1,?,?, '',0,?,'disconnected',?)",
    env.CLOUDFLARE_ACCOUNT_ID!,
    env.CLOUDFLARE_OAUTH_CLIENT_ID!,
    now(),
    randomToken(),
  );
  const current = (await row(env))!;
  const state = randomToken();
  const verifier = randomToken();
  const stateHash = await hash(state);
  const challengeBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...challengeBytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const pending = {
    verifier,
    account: env.CLOUDFLARE_ACCOUNT_ID!,
    client: env.CLOUDFLARE_OAUTH_CLIENT_ID!,
    redirect: redirect.href,
    revision: current.revision,
  };
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM cloudflare_oauth_flows WHERE session_hash=? OR expires_at<?",
    ).bind(session, Date.now()),
    env.DB.prepare(
      "INSERT INTO cloudflare_oauth_flows(state_hash,session_hash,verifier,expires_at) VALUES (?,?,?,?)",
    ).bind(
      stateHash,
      session,
      await seal(env, JSON.stringify(pending), `flow:${stateHash}`),
      Date.now() + 10 * 60000,
    ),
  ]);
  const query = new URLSearchParams({
    response_type: "code",
    client_id: pending.client,
    redirect_uri: redirect.href,
    scope: oauthScopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { url: `${oauthBase}/auth?${query}` };
}
export async function finishOAuth(
  env: Bindings,
  session: string,
  query: Record<string, string>,
) {
  if (!/^[a-f0-9]{64}$/.test(query.state || "")) return "invalid_state";
  const stateHash = await hash(query.state);
  const flow = await one<{ verifier: string }>(
    env,
    "DELETE FROM cloudflare_oauth_flows WHERE state_hash=? AND session_hash=? AND expires_at>? RETURNING verifier",
    stateHash,
    session,
    Date.now(),
  );
  if (!flow) return "invalid_state";
  if (query.error) return query.error === "access_denied" ? "denied" : "failed";
  if (!query.code || query.code.length > 8000) return "failed";
  let issued: z.infer<typeof tokenSchema> | undefined;
  try {
    const pending = pendingSchema.parse(
      JSON.parse(await unseal(env, flow.verifier, `flow:${stateHash}`)),
    );
    if (
      pending.account !== env.CLOUDFLARE_ACCOUNT_ID ||
      pending.client !== env.CLOUDFLARE_OAUTH_CLIENT_ID ||
      pending.redirect !== callbackUrl(env)
    )
      return "failed";
    issued = await tokenRequest(
      env,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: query.code,
        redirect_uri: pending.redirect,
        code_verifier: pending.verifier,
      }),
    );
    if (!issued.refresh_token) throw new Error("Missing refresh grant");
    // Prove the grant covers this Worker's account, not another selected account.
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${pending.account}/email/sending/zones?per_page=1`,
      {
        headers: { Authorization: `Bearer ${issued.access_token}` },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    const result = z
      .object({ success: z.literal(true), result: z.array(z.unknown()) })
      .safeParse(await response.json());
    if (!response.ok || !result.success)
      throw new Error("Wrong account or missing email access");
    const saved = await run(
      env,
      "UPDATE cloudflare_connection SET account_id=?,client_id=?,credentials=?,expires_at=?,connected_at=?,status='active',revision=?,refresh_lock=NULL,refresh_until=0 WHERE id=1 AND revision=?",
      pending.account,
      pending.client,
      await seal(
        env,
        JSON.stringify({
          access_token: issued.access_token,
          refresh_token: issued.refresh_token,
        }),
        purpose(env),
      ),
      Date.now() + issued.expires_in * 1000,
      now(),
      randomToken(),
      pending.revision,
    );
    if (!saved.meta.changes)
      throw new Error("Connection changed during authorization");
    return "connected";
  } catch {
    if (issued) {
      await revoke(
        env,
        issued.refresh_token || issued.access_token,
        issued.refresh_token ? "refresh_token" : "access_token",
      );
    }
    return "failed";
  }
}
export async function cloudflareAccessToken(env: Bindings) {
  if (!oauthMode(env)) {
    if (
      !env.CLOUDFLARE_API_TOKEN ||
      !accountId.safeParse(env.CLOUDFLARE_ACCOUNT_ID).success
    )
      fail("Connect your Cloudflare account before configuring domains.", 503);
    return env.CLOUDFLARE_API_TOKEN;
  }
  const current = await row(env);
  if (
    !oauthReady(env) ||
    !current ||
    !matches(env, current) ||
    current.status !== "active"
  )
    fail("Connect Cloudflare again to manage sending domains.", 503);
  const credentials = await readCredentials(env, current);
  if (current.expires_at > Date.now() + 60000) return credentials.access_token;
  const lock = randomToken();
  const claimed = await run(
    env,
    "UPDATE cloudflare_connection SET refresh_lock=?,refresh_until=? WHERE id=1 AND revision=? AND status='active' AND refresh_until<?",
    lock,
    Date.now() + 60000,
    current.revision,
    Date.now(),
  );
  if (!claimed.meta.changes)
    fail(
      "Cloudflare is reconnecting. Refresh this page in a few seconds.",
      503,
    );
  try {
    const next = await tokenRequest(
      env,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.refresh_token,
      }),
    );
    const updated = await run(
      env,
      "UPDATE cloudflare_connection SET credentials=?,expires_at=?,revision=?,refresh_lock=NULL,refresh_until=0 WHERE id=1 AND revision=? AND refresh_lock=? AND status='active'",
      await seal(
        env,
        JSON.stringify({
          access_token: next.access_token,
          refresh_token: next.refresh_token || credentials.refresh_token,
        }),
        purpose(env),
      ),
      Date.now() + next.expires_in * 1000,
      randomToken(),
      current.revision,
      lock,
    );
    if (!updated.meta.changes) {
      await revoke(
        env,
        next.refresh_token || credentials.refresh_token,
        "refresh_token",
      );
      fail("The Cloudflare connection changed. Refresh this page.", 503);
    }
    return next.access_token;
  } catch {
    // A lost refresh response may have rotated the token. Never replay it indefinitely.
    await run(
      env,
      "UPDATE cloudflare_connection SET status='reconnect',refresh_lock=NULL,refresh_until=0 WHERE id=1 AND revision=? AND refresh_lock=?",
      current.revision,
      lock,
    );
    fail("Cloudflare access expired. Connect your account again.", 503);
  }
}
export async function disconnectCloudflare(env: Bindings) {
  // Capture exactly the credentials being removed in the same transaction.
  // The tombstone prevents an in-flight callback or refresh from restoring access.
  const [selected] = await env.DB.batch<CloudflareConnection>([
    env.DB.prepare("SELECT * FROM cloudflare_connection WHERE id=1"),
    env.DB.prepare("DELETE FROM cloudflare_oauth_flows"),
    env.DB.prepare(
      "UPDATE cloudflare_connection SET credentials='',expires_at=0,status='disconnected',revision=?,refresh_lock=NULL,refresh_until=0 WHERE id=1",
    ).bind(randomToken()),
  ]);
  const current = selected.results[0];
  let revoked = !current?.credentials;
  if (current?.credentials && matches(env, current)) {
    try {
      const credentials = await readCredentials(env, current);
      const refreshRevoked = await revoke(
        env,
        credentials.refresh_token,
        "refresh_token",
      );
      const accessRevoked = await revoke(
        env,
        credentials.access_token,
        "access_token",
      );
      revoked = refreshRevoked && accessRevoked;
    } catch {
      revoked = false;
    }
  }
  return { ok: true, revoked };
}
