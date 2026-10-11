import type { Bindings } from "../types";
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export function appUrl(env: Bindings) {
  return env.APP_URL.replace(/\/$/, "");
}
export const local = (env: Bindings) => env.LOCAL_PREVIEW === "true";
export const sending = (env: Bindings) => env.SENDING_ENABLED === "true";
