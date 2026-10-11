import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/db/index.ts",
  out: "./worker/db/drizzle",
  dialect: "sqlite",
});
