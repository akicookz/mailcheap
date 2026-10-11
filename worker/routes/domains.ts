import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { readJson } from "../lib/http";
import { parse } from "../validation";
import {
  domainName,
  listDomains,
  lookupDomain,
  configureDomain,
  domainDetails,
} from "../services/domain-service";

export const domains = new Hono<AppEnv>();
domains.get("/", async (c) => c.json(await listDomains(c.env)));
domains.get("/lookup", async (c) =>
  c.json(await lookupDomain(c.env, parse(domainName, c.req.query("name")))),
);
domains.post("/", async (c) => {
  const { name } = parse(
    z.object({ name: domainName }),
    await readJson(c.req.raw),
  );
  return c.json(await configureDomain(c.env, name), 201);
});
domains.get("/:name", async (c) =>
  c.json(
    await domainDetails(
      c.env,
      parse(domainName, c.req.param("name")),
      c.req.query("verify") === "true",
    ),
  ),
);
