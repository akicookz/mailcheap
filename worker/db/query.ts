import type { Bindings, Row } from "../types";
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
