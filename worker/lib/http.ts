import { HTTPException } from "hono/http-exception";
export function fail(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503 = 400,
): never {
  throw new HTTPException(status, { message });
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
