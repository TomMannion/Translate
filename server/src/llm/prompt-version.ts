import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PROMPTS_DIR = path.resolve(import.meta.dirname, "prompts");

const cache = new Map<string, { text: string; version: string }>();

export interface LoadedPrompt {
  text: string;
  version: string; // first 12 chars of sha256
}

export function loadPrompt(name: string): LoadedPrompt {
  const cached = cache.get(name);
  if (cached) return cached;
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  const text = fs.readFileSync(file, "utf8");
  const version = crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 12);
  const value = { text, version };
  cache.set(name, value);
  return value;
}
