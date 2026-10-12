import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import { type AppEnv, type Bindings } from "./types";
import { one, run } from "./db/query";
import { fail, readJson } from "./lib/http";
import { limit } from "./lib/rate-limit";
import { parse } from "./validation";
import { local } from "./lib/config";

const encoder = new TextEncoder();
const cookie = (env: Bindings) =>
  local(env) ? "mailcheap_session" : "__Host-mailcheap_session";
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
async function equal(a: string, b: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(a));
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(b));
}
const version = (env: Bindings) =>
  hash(`${env.ADMIN_EMAIL}:${env.ADMIN_PASSWORD}`);
export function configured(env: Bindings) {
  return (
    !!env.ADMIN_EMAIL &&
    env.ADMIN_PASSWORD?.length >= 16 &&
    env.LINK_SECRET?.length >= 32
  );
}
export async function authenticated(c: Context<AppEnv>) {
  const token = getCookie(c, cookie(c.env));
  if (!token || !configured(c.env)) return false;
  const session = await one(
    c.env,
    "SELECT version FROM sessions WHERE token_hash=? AND expires_at>?",
    await hash(token),
    Date.now(),
  );
  return session?.version === (await version(c.env));
}
export async function sessionHash(c: Context<AppEnv>) {
  const token = getCookie(c, cookie(c.env));
  if (!token || !(await authenticated(c))) fail("Sign in to continue", 401);
  return hash(token);
}
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await authenticated(c))) fail("Sign in to continue", 401);
  await next();
};
export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const allowed = new URL(c.env.APP_URL).origin;
    if (c.req.header("Origin") !== allowed)
      fail("Request origin is not allowed", 403);
  }
  await next();
};
export async function login(c: Context<AppEnv>) {
  if (!configured(c.env))
    return c.json(
      {
        error:
          "Set ADMIN_EMAIL, ADMIN_PASSWORD (16+ characters), and LINK_SECRET (32+ characters).",
      },
      503,
    );
  if (
    await limit(
      c.env,
      `login:${c.req.header("cf-connecting-ip") || "local"}`,
      10,
      600,
    )
  )
    fail("Too many attempts. Try again in ten minutes.", 429);
  const body = parse(
    z.object({ email: z.string().max(254), password: z.string().max(1024) }),
    await readJson(c.req.raw),
  );
  const emailOk = await equal(
    String(body.email || "")
      .trim()
      .toLowerCase(),
    c.env.ADMIN_EMAIL.toLowerCase(),
  );
  const passwordOk = await equal(
    String(body.password || ""),
    c.env.ADMIN_PASSWORD,
  );
  if (!emailOk || !passwordOk) fail("Email or password is incorrect", 401);
  const token = randomToken();
  await run(
    c.env,
    "INSERT INTO sessions(token_hash,version,expires_at) VALUES (?,?,?)",
    await hash(token),
    await version(c.env),
    Date.now() + 7 * 86400000,
  );
  setCookie(c, cookie(c.env), token, {
    httpOnly: true,
    secure: !local(c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 86400,
  });
  return c.json({ email: c.env.ADMIN_EMAIL });
}
export async function logout(c: Context<AppEnv>) {
  const token = getCookie(c, cookie(c.env));
  if (token)
    await run(
      c.env,
      "DELETE FROM sessions WHERE token_hash=?",
      await hash(token),
    );
  deleteCookie(c, cookie(c.env), { path: "/", secure: !local(c.env) });
  return c.json({ ok: true });
}
export async function signLink(
  env: Bindings,
  purpose: string,
  data: Record<string, string>,
) {
  const payload = btoa(
    String.fromCharCode(...encoder.encode(JSON.stringify(data))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.LINK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${purpose}.${payload}`),
    ),
  );
  return `${payload}.${Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("")}`;
}
export async function readLink(env: Bindings, purpose: string, token: string) {
  try {
    if (token.length > 8000) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.LINK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(signature.match(/../g)!, (v) =>
      parseInt(v, 16),
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        encoder.encode(`${purpose}.${payload}`),
      ))
    )
      return null;
    return JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(payload.replaceAll("-", "+").replaceAll("_", "/")),
          (v) => v.charCodeAt(0),
        ),
      ),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}
