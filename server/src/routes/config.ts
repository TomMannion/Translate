import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { readConfig, toPublic, writeConfig } from "../config.ts";
import { pingGemini, GeminiError } from "../llm/gemini.ts";
import type {
  AppConfig,
  FolderProbeResult,
  TestKeyResult,
} from "../../../shared/types.ts";

export const configRoute = new Hono();

configRoute.get("/", (c) => c.json(toPublic(readConfig())));

configRoute.put("/", async (c) => {
  const body = (await c.req.json()) as Partial<AppConfig>;
  const allowedKeys: (keyof AppConfig)[] = [
    "gemini_api_key",
    "library_folder_path",
    "file_conflict_strategy",
    "default_thinking_level",
    "chunk_size_lines",
    "model_alias",
  ];
  const patch: Partial<AppConfig> = {};
  for (const k of allowedKeys) {
    if (k in body && body[k] !== undefined) {
      // Treat empty string for the api key as "don't change".
      if (k === "gemini_api_key" && typeof body[k] === "string" && body[k] === "") {
        continue;
      }
      (patch as Record<string, unknown>)[k] = body[k];
    }
  }
  const next = writeConfig(patch);
  return c.json(toPublic(next));
});

configRoute.post("/test-key", async (c) => {
  try {
    const r = await pingGemini();
    const out: TestKeyResult = { ok: true, model: r.model };
    return c.json(out);
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : String(err);
    const out: TestKeyResult = { ok: false, error: message };
    return c.json(out, 200); // 200 — surface error in body, not HTTP code
  }
});

configRoute.post("/probe-folder", async (c) => {
  const body = (await c.req.json()) as { path?: string };
  const target = body.path?.trim() ?? "";
  const result: FolderProbeResult = {
    valid: false,
    is_dir: false,
    has_srt_files: false,
    sample_files: [],
  };
  if (!target) {
    result.error = "Path is empty";
    return c.json(result);
  }
  try {
    const stat = fs.statSync(target);
    result.valid = true;
    result.is_dir = stat.isDirectory();
    if (!result.is_dir) {
      result.error = "Path exists but is not a directory";
      return c.json(result);
    }
    const entries = fs.readdirSync(target);
    const srt = entries.filter((e) => e.toLowerCase().endsWith(".srt"));
    result.has_srt_files = srt.length > 0;
    result.sample_files = srt.slice(0, 5).map((s) => path.basename(s));
    return c.json(result);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return c.json(result);
  }
});
