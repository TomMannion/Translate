import { callGemini } from "./gemini.ts";
import { loadPrompt } from "./prompt-version.ts";
import type { EpisodeMetadata } from "../../../shared/types.ts";

interface ExtractContextArgs {
  episodeId: string;
  title: string;
  description: string;
  metadata: EpisodeMetadata;
  transcript: Array<{ idx: number; source_text: string }>;
}

const GLOSSARY_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      term: { type: "STRING" },
      suggested_english: { type: "STRING" },
      reason: { type: "STRING" },
    },
    required: ["term", "suggested_english", "reason"],
  },
} as const;

interface GlossaryEntry {
  term: string;
  suggested_english: string;
  reason: string;
}

function buildUserPrompt(args: ExtractContextArgs): string {
  const m = args.metadata;
  const today = new Date().toISOString().slice(0, 10);
  const lines = args.transcript
    .map((l) => `${l.idx}: ${l.source_text.replace(/\n/g, " ")}`)
    .join("\n");
  return [
    `Today's date: ${today}`,
    "",
    "Video metadata:",
    `- Title: ${args.title || "(not set)"}`,
    `- Description: ${args.description || "(not set)"}`,
    `- Equipment featured: ${m.equipment || "(not set)"}`,
    `- Coffee/roaster featured: ${m.coffee_featured || "(not set)"}`,
    `- Guests: ${m.guests || "(not set)"}`,
    `- Video type: ${m.video_type || "(not set)"}`,
    `- Custom notes: ${m.custom_notes || "(none)"}`,
    "",
    "Full Cantonese transcript (line-by-line):",
    lines,
  ].join("\n");
}

export async function extractContext(
  args: ExtractContextArgs,
): Promise<{ markdown: string; overview_call_id: string; glossary_call_id: string }> {
  const userPrompt = buildUserPrompt(args);
  const overviewPrompt = loadPrompt("context-overview");
  const glossaryPrompt = loadPrompt("context-glossary");

  // Run sequentially so a glossary failure doesn't waste an overview call's
  // tokens and vice versa. They're not heavy enough to bother parallelising.
  const overview = await callGemini({
    episodeId: args.episodeId,
    kind: "context",
    promptVersion: overviewPrompt.version,
    systemInstruction: overviewPrompt.text,
    userText: userPrompt,
    thinkingLevel: "low",
  });

  const glossary = await callGemini({
    episodeId: args.episodeId,
    kind: "context",
    promptVersion: glossaryPrompt.version,
    systemInstruction: glossaryPrompt.text,
    userText: userPrompt,
    responseMimeType: "application/json",
    responseSchema: GLOSSARY_RESPONSE_SCHEMA as never,
    thinkingLevel: "low",
  });

  let entries: GlossaryEntry[] = [];
  try {
    entries = JSON.parse(glossary.text) as GlossaryEntry[];
  } catch {
    entries = [];
  }

  const glossaryMd = entries.length
    ? entries
        .map(
          (e) =>
            `- \`${e.term}\` → ${e.suggested_english}${
              e.reason ? ` *(${e.reason})*` : ""
            }`,
        )
        .join("\n")
    : "_(no glossary entries returned)_";

  const markdown =
    overview.text.trim() +
    "\n\n## Glossary & Terminology\n" +
    glossaryMd +
    "\n";

  return {
    markdown,
    overview_call_id: overview.callId,
    glossary_call_id: glossary.callId,
  };
}
