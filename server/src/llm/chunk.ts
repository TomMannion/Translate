// Split a transcript into overlap-context chunks for sequential translation.
//
// Each chunk has:
//   - `lines`: the lines to translate this round (idx + source_text)
//   - `overlap`: trailing lines from the previous chunk, with their already-
//     produced translations, sent purely as context so the model can carry
//     tone/terminology forward. The model is instructed NOT to re-translate
//     these.

export interface TranscriptLine {
  idx: number;
  source_text: string;
}

export interface OverlapLine {
  idx: number;
  source_text: string;
  translation: string;
}

export interface TranslationChunk {
  index: number;          // 0-based
  total: number;
  lines: TranscriptLine[];
  overlap: OverlapLine[]; // empty for chunk 0
}

export function chunkPlan(
  lines: TranscriptLine[],
  chunkSize: number,
  overlapSize = 5,
): { totalChunks: number; ranges: Array<{ start: number; end: number }> } {
  if (chunkSize <= 0) throw new Error("chunkSize must be > 0");
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    ranges.push({ start: i, end: Math.min(i + chunkSize, lines.length) });
  }
  return { totalChunks: ranges.length, ranges };
}

export function buildChunk(
  lines: TranscriptLine[],
  chunkSize: number,
  overlapSize: number,
  chunkIndex: number,
  prevTranslations: Map<number, string>,
): TranslationChunk {
  const { totalChunks, ranges } = chunkPlan(lines, chunkSize, overlapSize);
  if (chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw new Error(`chunkIndex out of range: ${chunkIndex}/${totalChunks}`);
  }
  const range = ranges[chunkIndex]!;
  const sliced = lines.slice(range.start, range.end);

  const overlap: OverlapLine[] = [];
  if (chunkIndex > 0 && overlapSize > 0) {
    const overlapStart = Math.max(0, range.start - overlapSize);
    for (let i = overlapStart; i < range.start; i++) {
      const l = lines[i]!;
      const t = prevTranslations.get(l.idx);
      if (t == null) continue; // skip if a previous chunk failed
      overlap.push({ idx: l.idx, source_text: l.source_text, translation: t });
    }
  }

  return {
    index: chunkIndex,
    total: totalChunks,
    lines: sliced,
    overlap,
  };
}

// Pretty-print a chunk for the user prompt.
export function chunkToUserPrompt(
  chunk: TranslationChunk,
  contextDocMarkdown: string,
  currentDate: string,
): string {
  const parts: string[] = [];
  parts.push(`Today's date: ${currentDate}`);
  parts.push("");
  if (contextDocMarkdown.trim()) {
    parts.push("EPISODE CONTEXT (human-reviewed):");
    parts.push(contextDocMarkdown.trim());
    parts.push("");
  }
  if (chunk.overlap.length > 0) {
    parts.push(
      "PREVIOUS CHUNK (for tone/terminology continuity only — do NOT re-translate, do NOT include in output):",
    );
    parts.push(
      JSON.stringify(
        chunk.overlap.map((o) => ({
          idx: o.idx,
          source: o.source_text,
          translation: o.translation,
        })),
        null,
        2,
      ),
    );
    parts.push("");
  }
  parts.push(
    `CANTONESE LINES TO TRANSLATE (translate each, preserving idx; return exactly ${chunk.lines.length} items):`,
  );
  parts.push(
    JSON.stringify(
      chunk.lines.map((l) => ({ idx: l.idx, source: l.source_text })),
      null,
      2,
    ),
  );
  return parts.join("\n");
}

export interface ChunkValidationResult {
  ok: boolean;
  missing: number[];
  extra: number[];
  duplicates: number[];
}

export function validateChunkOutput(
  chunk: TranslationChunk,
  output: Array<{ idx: number; translation: string }>,
): ChunkValidationResult {
  const expected = new Set(chunk.lines.map((l) => l.idx));
  const seen = new Set<number>();
  const duplicates: number[] = [];
  for (const item of output) {
    if (seen.has(item.idx)) duplicates.push(item.idx);
    seen.add(item.idx);
  }
  const missing = [...expected].filter((i) => !seen.has(i));
  const extra = [...seen].filter((i) => !expected.has(i));
  return {
    ok: missing.length === 0 && extra.length === 0 && duplicates.length === 0,
    missing,
    extra,
    duplicates,
  };
}
