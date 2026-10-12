import type { Bindings } from "../types";

const encoder = new TextEncoder();
function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function decode(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
async function key(env: Bindings) {
  if (!env.LINK_SECRET || env.LINK_SECRET.length < 32)
    throw new Error("Connection encryption is not configured");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.LINK_SECRET),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("mailcheap"),
      info: encoder.encode("cloudflare-oauth-v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(env: Bindings, value: string, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
    await key(env),
    encoder.encode(value),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function unseal(env: Bindings, value: string, purpose: string) {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext)
    throw new Error("Invalid encrypted connection");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decode(iv),
        additionalData: encoder.encode(purpose),
      },
      await key(env),
      decode(ciphertext),
    ),
  );
}
