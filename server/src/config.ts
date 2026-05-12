import fs from "node:fs";
import path from "node:path";
import type { AppConfig, PublicAppConfig } from "../../shared/types.ts";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

const DEFAULTS: AppConfig = {
  gemini_api_key: "",
  library_folder_path: "",
  file_conflict_strategy: "increment",
  // Google's recommended default for accuracy-sensitive work on Gemini 3.1
  // Pro is "high" (dynamic thinking budget). This controls translate +
  // re-translate only; context extraction always runs at "low".
  default_thinking_level: "high",
  chunk_size_lines: 50,
  model_alias: "gemini-pro-latest",
};

export function dataDir(): string {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function readConfig(): AppConfig {
  dataDir();
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    console.error("Failed to read config.json, falling back to defaults", err);
    return { ...DEFAULTS };
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const current = readConfig();
  const next = { ...current, ...patch };
  dataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  // chmod 600 so it's harder to accidentally world-read on shared machines.
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // best effort; non-fatal on platforms where it isn't supported
  }
  return next;
}

export function toPublic(c: AppConfig): PublicAppConfig {
  return {
    library_folder_path: c.library_folder_path,
    file_conflict_strategy: c.file_conflict_strategy,
    default_thinking_level: c.default_thinking_level,
    chunk_size_lines: c.chunk_size_lines,
    model_alias: c.model_alias,
    api_key_configured: c.gemini_api_key.trim().length > 0,
  };
}
