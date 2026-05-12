import { callGemini } from "./gemini.ts";
import { loadPrompt } from "./prompt-version.ts";
import type { LineRow } from "../types.ts";

interface RetranslateArgs {
  episodeId: string;
  target: LineRow;
  neighbours: LineRow[]; // up to ±3, in idx order
  contextDoc: string;
  hint: string;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    idx: { type: "INTEGER" },
    translation: { type: "STRING" },
  },
  required: ["idx", "translation"],
} as const;

export async function retranslateLine(args: RetranslateArgs): Promise<{
  text: string;
  callId: string;
  model: string;
  promptVersion: string;
}> {
  const prompt = loadPrompt("retranslate");
  const today = new Date().toISOString().slice(0, 10);

  const neighboursSerialised = args.neighbours
    .filter((n) => n.idx !== args.target.idx)
    .map((n) => ({
      idx: n.idx,
      source: n.source_text,
      current_translation: n.translation ?? "(not yet translated)",
    }));

  const userText = [
    `Today's date: ${today}`,
    "",
    "EPISODE CONTEXT (human-reviewed):",
    args.contextDoc.trim() || "_(no context document provided)_",
    "",
    "NEIGHBOURING LINES (context only — do NOT re-translate):",
    JSON.stringify(neighboursSerialised, null, 2),
    "",
    "TARGET LINE TO RE-TRANSLATE:",
    JSON.stringify(
      {
        idx: args.target.idx,
        source: args.target.source_text,
        prior_translation: args.target.translation ?? "",
      },
      null,
      2,
    ),
    "",
    args.hint.trim()
      ? `USER HINT: ${args.hint.trim()}`
      : "USER HINT: (none — produce a different rendering than prior_translation)",
  ].join("\n");

  const result = await callGemini({
    episodeId: args.episodeId,
    kind: "retranslate",
    promptVersion: prompt.version,
    systemInstruction: prompt.text,
    userText,
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA as never,
  });

  const parsed = JSON.parse(result.text) as {
    idx: number;
    translation: string;
  };
  if (parsed.idx !== args.target.idx) {
    throw new Error(
      `Retranslate idx mismatch: expected ${args.target.idx}, got ${parsed.idx}`,
    );
  }
  return {
    text: parsed.translation,
    callId: result.callId,
    model: result.model,
    promptVersion: prompt.version,
  };
}
