import type { Bindings } from "../types";
import { one } from "../db/query";
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
