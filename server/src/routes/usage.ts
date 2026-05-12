import { Hono } from "hono";
import { getDb } from "../db.ts";
import { readPricing } from "../llm/pricing.ts";
import type {
  UsageByEpisode,
  UsageByKind,
  UsageByModel,
  UsageReport,
  UsageTotals,
} from "../../../shared/types.ts";

export const usageRoute = new Hono();

const SUM_COLUMNS = `
  COUNT(*) AS calls,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(thinking_tokens), 0) AS thinking_tokens,
  COALESCE(SUM(cost_usd), 0) AS cost_usd
`;

usageRoute.get("/", (c) => {
  const db = getDb();

  const totals = db
    .prepare(`SELECT ${SUM_COLUMNS} FROM gemini_calls WHERE error IS NULL`)
    .get() as UsageTotals;

  const by_episode = db
    .prepare(
      `SELECT gc.episode_id AS episode_id,
              e.title       AS episode_title,
              ${SUM_COLUMNS}
       FROM gemini_calls gc
       LEFT JOIN episodes e ON e.id = gc.episode_id
       WHERE gc.error IS NULL
       GROUP BY gc.episode_id
       ORDER BY cost_usd DESC`,
    )
    .all() as UsageByEpisode[];

  const by_kind = db
    .prepare(
      `SELECT kind, ${SUM_COLUMNS}
       FROM gemini_calls
       WHERE error IS NULL
       GROUP BY kind
       ORDER BY cost_usd DESC`,
    )
    .all() as UsageByKind[];

  const by_model = db
    .prepare(
      `SELECT model, ${SUM_COLUMNS}
       FROM gemini_calls
       WHERE error IS NULL
       GROUP BY model
       ORDER BY cost_usd DESC`,
    )
    .all() as UsageByModel[];

  const last = db
    .prepare(
      "SELECT MAX(created_at) AS t FROM gemini_calls WHERE error IS NULL",
    )
    .get() as { t: number | null };

  const report: UsageReport = {
    totals,
    by_episode,
    by_kind,
    by_model,
    pricing: readPricing(),
    last_call_at: last.t,
  };
  return c.json(report);
});
