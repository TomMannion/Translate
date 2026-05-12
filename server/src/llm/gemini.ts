import crypto from "node:crypto";
import { GoogleGenAI, type Schema } from "@google/genai";
import type { ThinkingLevel } from "../../../shared/types.ts";
import { getDb } from "../db.ts";
import { readConfig } from "../config.ts";
import { costFor } from "./pricing.ts";

const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  low: 512,
  medium: 2048,
  high: 8192,
};

export interface GeminiCallParams {
  episodeId: string | null;
  kind: "context" | "translate" | "retranslate" | "test";
  promptVersion: string;
  systemInstruction: string;
  userText: string;
  responseSchema?: Schema;
  responseMimeType?: string;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

export interface GeminiCallResult {
  callId: string;
  text: string;
  model: string; // resolved model id from the response
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  latencyMs: number;
}

export class GeminiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "GeminiError";
  }
}

function newClient(): { ai: GoogleGenAI; modelAlias: string } {
  const cfg = readConfig();
  if (!cfg.gemini_api_key) {
    throw new GeminiError("Gemini API key is not configured");
  }
  const ai = new GoogleGenAI({ apiKey: cfg.gemini_api_key });
  return { ai, modelAlias: cfg.model_alias };
}

export async function callGemini(
  params: GeminiCallParams,
): Promise<GeminiCallResult> {
  const { ai, modelAlias } = newClient();
  const thinking = params.thinkingLevel ?? readConfig().default_thinking_level;

  const callId = crypto.randomUUID();
  const startedAt = Date.now();

  const config: Record<string, unknown> = {
    systemInstruction: params.systemInstruction,
    thinkingConfig: { thinkingBudget: THINKING_BUDGETS[thinking] },
  };
  if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
  if (params.responseSchema) config.responseSchema = params.responseSchema;

  try {
    if (params.signal?.aborted) {
      throw new GeminiError("Aborted before request started");
    }

    const response = await ai.models.generateContent({
      model: modelAlias,
      config,
      contents: [{ role: "user", parts: [{ text: params.userText }] }],
    });

    const latencyMs = Date.now() - startedAt;
    const text = response.text ?? "";
    const model = response.modelVersion ?? modelAlias;
    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;
    const thinkingTokens = usage?.thoughtsTokenCount ?? 0;
    const costUsd = costFor(model, inputTokens, outputTokens, thinkingTokens);

    recordCall({
      id: callId,
      episodeId: params.episodeId,
      kind: params.kind,
      model,
      promptVersion: params.promptVersion,
      inputTokens,
      outputTokens,
      thinkingTokens,
      costUsd,
      latencyMs,
      error: null,
    });

    return {
      callId,
      text,
      model,
      inputTokens,
      outputTokens,
      thinkingTokens,
      costUsd,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    recordCall({
      id: callId,
      episodeId: params.episodeId,
      kind: params.kind,
      model: modelAlias,
      promptVersion: params.promptVersion,
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      costUsd: 0,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}

interface CallRow {
  id: string;
  episodeId: string | null;
  kind: GeminiCallParams["kind"];
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  latencyMs: number;
  error: string | null;
}

function recordCall(row: CallRow): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO gemini_calls (id, episode_id, kind, model, prompt_version,
       input_tokens, output_tokens, thinking_tokens, cost_usd, latency_ms,
       created_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.episodeId,
    row.kind,
    row.model,
    row.promptVersion,
    row.inputTokens,
    row.outputTokens,
    row.thinkingTokens,
    row.costUsd,
    row.latencyMs,
    Date.now(),
    row.error,
  );
}

// Cheap key-test call — kept tiny on purpose.
export async function pingGemini(): Promise<{ ok: true; model: string }> {
  const res = await callGemini({
    episodeId: null,
    kind: "test",
    promptVersion: "ping",
    systemInstruction:
      "Reply with the single token OK and nothing else.",
    userText: "ping",
    thinkingLevel: "low",
  });
  return { ok: true, model: res.model };
}
