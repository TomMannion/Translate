// Per-model pricing in USD per million tokens.
//
// All values are ESTIMATES. The dashboard labels them as such. For
// authoritative billing, check Google Cloud Console.
//
// Lookup order against a resolved `modelVersion` from the API response:
//   1. exact match in `models`
//   2. longest prefix match in `models` (so `gemini-2.5-pro-001` matches
//      `gemini-2.5-pro`)
//   3. `default`
//
// To override, drop a `data/pricing.json` with the same shape — it's merged
// over these defaults on every read. No restart required.

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../config.ts";

export interface ModelRates {
  input_per_mtok: number;
  output_per_mtok: number;
  thinking_per_mtok: number;
}

export interface PricingTable {
  default: ModelRates;
  models: Record<string, ModelRates>;
}

const DEFAULTS: PricingTable = {
  default: {
    input_per_mtok: 1.25,
    output_per_mtok: 10.0,
    thinking_per_mtok: 10.0,
  },
  models: {
    "gemini-2.5-pro": {
      input_per_mtok: 1.25,
      output_per_mtok: 10.0,
      thinking_per_mtok: 10.0,
    },
    "gemini-2.5-flash": {
      input_per_mtok: 0.3,
      output_per_mtok: 2.5,
      thinking_per_mtok: 2.5,
    },
    "gemini-pro-latest": {
      input_per_mtok: 1.25,
      output_per_mtok: 10.0,
      thinking_per_mtok: 10.0,
    },
  },
};

function pricingPath(): string {
  return path.join(dataDir(), "pricing.json");
}

export function readPricing(): PricingTable {
  const p = pricingPath();
  if (!fs.existsSync(p)) return DEFAULTS;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<PricingTable>;
    return {
      default: { ...DEFAULTS.default, ...(parsed.default ?? {}) },
      models: { ...DEFAULTS.models, ...(parsed.models ?? {}) },
    };
  } catch (err) {
    console.error("Failed to read pricing.json, falling back to defaults", err);
    return DEFAULTS;
  }
}

export function ratesFor(model: string, table = readPricing()): ModelRates {
  if (table.models[model]) return table.models[model];
  // Longest prefix match. Keys sorted by length descending.
  const keys = Object.keys(table.models).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return table.models[key]!;
  }
  return table.default;
}

export function costFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number,
): number {
  const r = ratesFor(model);
  return (
    (inputTokens * r.input_per_mtok +
      outputTokens * r.output_per_mtok +
      thinkingTokens * r.thinking_per_mtok) /
    1_000_000
  );
}
