import { Hono } from "hono";
import { getDb } from "../db.ts";
import type { UsageTotals } from "../../../shared/types.ts";

export const usageRoute = new Hono();

usageRoute.get("/", (c) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(thinking_tokens), 0) AS thinking_tokens,
              COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM gemini_calls`,
    )
    .get() as UsageTotals;
  return c.json(row);
});
