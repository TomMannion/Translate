import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getDb } from "../db.ts";
import { readConfig } from "../config.ts";
import { callGemini, GeminiError } from "../llm/gemini.ts";
import { extractContext } from "../llm/context.ts";
import { loadPrompt } from "../llm/prompt-version.ts";
import {
  buildChunk,
  chunkPlan,
  chunkToUserPrompt,
  validateChunkOutput,
  type TranscriptLine,
} from "../llm/chunk.ts";
import { wrapSubtitle } from "../srt/normalize.ts";
import { writeSrt } from "../srt/write.ts";
import type { LineRow, EpisodeRow } from "../types.ts";
import type {
  EpisodeMetadata,
  TranslationEvent,
} from "../../../shared/types.ts";

export const pipelineRoute = new Hono();

// Per-episode AbortControllers for in-flight translation runs.
const inFlight = new Map<string, AbortController>();

const TRANSLATE_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      idx: { type: "INTEGER" },
      translation: { type: "STRING" },
    },
    required: ["idx", "translation"],
  },
} as const;

pipelineRoute.post("/episodes/:id/extract-context", async (c) => {
  const episodeId = c.req.param("id");
  const db = getDb();

  const epRow = db
    .prepare("SELECT * FROM episodes WHERE id = ?")
    .get(episodeId) as EpisodeRow | undefined;
  if (!epRow) return c.json({ error: "episode not found" }, 404);

  const lineRows = db
    .prepare(
      "SELECT idx, source_text FROM subtitle_lines WHERE episode_id = ? ORDER BY idx ASC",
    )
    .all(episodeId) as Array<{ idx: number; source_text: string }>;
  if (lineRows.length === 0) {
    return c.json({ error: "episode has no lines" }, 400);
  }

  try {
    const result = await extractContext({
      episodeId,
      title: epRow.title,
      description: epRow.description,
      metadata: JSON.parse(epRow.metadata || "{}") as EpisodeMetadata,
      transcript: lineRows,
    });

    const now = Date.now();
    db.prepare(
      `INSERT INTO context_docs (episode_id, markdown_content, generated_at, edited_at)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(episode_id) DO UPDATE SET
         markdown_content = excluded.markdown_content,
         generated_at = excluded.generated_at,
         edited_at = NULL`,
    ).run(episodeId, result.markdown, now);
    db.prepare("UPDATE episodes SET updated_at = ? WHERE id = ?").run(
      now,
      episodeId,
    );

    return c.json({ ok: true, markdown_content: result.markdown });
  } catch (err) {
    const message =
      err instanceof GeminiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return c.json({ error: message }, 500);
  }
});

pipelineRoute.put("/episodes/:id/context", async (c) => {
  const episodeId = c.req.param("id");
  const db = getDb();

  const epRow = db
    .prepare("SELECT id FROM episodes WHERE id = ?")
    .get(episodeId) as { id: string } | undefined;
  if (!epRow) return c.json({ error: "episode not found" }, 404);

  const body = (await c.req.json()) as { markdown_content?: string };
  if (typeof body.markdown_content !== "string") {
    return c.json({ error: "markdown_content required" }, 400);
  }

  const now = Date.now();
  const existing = db
    .prepare("SELECT episode_id FROM context_docs WHERE episode_id = ?")
    .get(episodeId);

  if (existing) {
    db.prepare(
      "UPDATE context_docs SET markdown_content = ?, edited_at = ? WHERE episode_id = ?",
    ).run(body.markdown_content, now, episodeId);
  } else {
    db.prepare(
      `INSERT INTO context_docs (episode_id, markdown_content, generated_at, edited_at)
       VALUES (?, ?, ?, ?)`,
    ).run(episodeId, body.markdown_content, now, now);
  }
  db.prepare("UPDATE episodes SET updated_at = ? WHERE id = ?").run(
    now,
    episodeId,
  );

  return c.json({ ok: true, markdown_content: body.markdown_content });
});

pipelineRoute.post("/episodes/:id/translate/cancel", (c) => {
  const ctrl = inFlight.get(c.req.param("id"));
  if (ctrl) ctrl.abort();
  return c.json({ cancelled: !!ctrl });
});

pipelineRoute.get("/episodes/:id/events", (c) => {
  const episodeId = c.req.param("id");
  const cfg = readConfig();
  const db = getDb();

  const epRow = db
    .prepare("SELECT * FROM episodes WHERE id = ?")
    .get(episodeId) as EpisodeRow | undefined;
  if (!epRow) {
    return c.json({ error: "episode not found" }, 404);
  }

  const lineRows = db
    .prepare(
      "SELECT * FROM subtitle_lines WHERE episode_id = ? ORDER BY idx ASC",
    )
    .all(episodeId) as LineRow[];

  if (lineRows.length === 0) {
    return c.json({ error: "episode has no lines" }, 400);
  }

  const contextRow = db
    .prepare("SELECT markdown_content FROM context_docs WHERE episode_id = ?")
    .get(episodeId) as { markdown_content: string } | undefined;
  const contextDoc = contextRow?.markdown_content ?? "";

  // Carry forward translations from previous runs (resume on cancel/crash).
  const transcript: TranscriptLine[] = lineRows.map((r) => ({
    idx: r.idx,
    source_text: r.source_text,
  }));
  const knownTranslations = new Map<number, string>();
  for (const r of lineRows) {
    if (r.translation) knownTranslations.set(r.idx, r.translation);
  }

  const chunkSize = cfg.chunk_size_lines;
  const plan = chunkPlan(transcript, chunkSize);

  // Cancel any previous run for this episode.
  inFlight.get(episodeId)?.abort();
  const controller = new AbortController();
  inFlight.set(episodeId, controller);

  return streamSSE(c, async (stream) => {
    const send = (ev: TranslationEvent) =>
      stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });

    try {
      const totalLines = transcript.length;
      await send({
        type: "start",
        total_chunks: plan.totalChunks,
        total_lines: totalLines,
      });

      const prompt = loadPrompt("translate");
      const today = new Date().toISOString().slice(0, 10);

      const updateLine = db.prepare(
        `UPDATE subtitle_lines
         SET previous_translation = translation,
             translation = ?,
             last_change_source = 'initial',
             model = ?,
             prompt_version = ?,
             gemini_call_id = ?,
             updated_at = ?
         WHERE episode_id = ? AND idx = ?`,
      );
      const updateEpisodeCounts = db.prepare(
        `UPDATE episodes
         SET lines_translated_count = (
               SELECT COUNT(*) FROM subtitle_lines
               WHERE episode_id = ? AND translation IS NOT NULL
             ),
             updated_at = ?
         WHERE id = ?`,
      );

      let linesDone = transcript.filter((l) =>
        knownTranslations.has(l.idx),
      ).length;

      for (let ci = 0; ci < plan.totalChunks; ci++) {
        if (controller.signal.aborted) {
          await send({ type: "cancelled" });
          return;
        }
        const range = plan.ranges[ci]!;
        const chunkLines = transcript.slice(range.start, range.end);
        // Skip chunks that are already fully translated.
        const allDone = chunkLines.every((l) =>
          knownTranslations.has(l.idx),
        );
        if (allDone) {
          await send({
            type: "chunk_complete",
            chunk: ci + 1,
            of: plan.totalChunks,
            lines_done: linesDone,
            total_lines: totalLines,
          });
          continue;
        }

        const chunk = buildChunk(transcript, chunkSize, 5, ci, knownTranslations);
        const userText = chunkToUserPrompt(chunk, contextDoc, today);

        let parsed: Array<{ idx: number; translation: string }> | null = null;
        let lastError = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          if (controller.signal.aborted) {
            await send({ type: "cancelled" });
            return;
          }
          try {
            const corrective =
              attempt === 0
                ? ""
                : `\n\nIMPORTANT: your previous response failed validation: ${lastError}. Return exactly one object per requested idx, no duplicates, no extras.`;
            const result = await callGemini({
              episodeId,
              kind: "translate",
              promptVersion: prompt.version,
              systemInstruction: prompt.text + corrective,
              userText,
              responseMimeType: "application/json",
              responseSchema: TRANSLATE_RESPONSE_SCHEMA as never,
              signal: controller.signal,
            });
            const candidate = JSON.parse(result.text) as Array<{
              idx: number;
              translation: string;
            }>;
            const v = validateChunkOutput(chunk, candidate);
            if (!v.ok) {
              lastError = `missing=${v.missing.join(",") || "-"} extra=${v.extra.join(",") || "-"} duplicates=${v.duplicates.join(",") || "-"}`;
              continue;
            }
            parsed = candidate;

            const writeTx = db.transaction(() => {
              const now = Date.now();
              for (const item of candidate) {
                const wrapped = wrapSubtitle(item.translation);
                updateLine.run(
                  wrapped,
                  result.model,
                  prompt.version,
                  result.callId,
                  now,
                  episodeId,
                  item.idx,
                );
                knownTranslations.set(item.idx, wrapped);
              }
              updateEpisodeCounts.run(episodeId, now, episodeId);
            });
            writeTx();
            break;
          } catch (err) {
            if (err instanceof GeminiError) {
              lastError = err.message;
              continue;
            }
            lastError =
              err instanceof Error ? err.message : String(err);
            continue;
          }
        }

        if (!parsed) {
          await send({
            type: "chunk_error",
            chunk: ci + 1,
            error: lastError || "unknown",
          });
          await send({
            type: "error",
            error: `chunk ${ci + 1} failed: ${lastError}`,
          });
          return;
        }

        linesDone += chunk.lines.length;
        await send({
          type: "chunk_complete",
          chunk: ci + 1,
          of: plan.totalChunks,
          lines_done: linesDone,
          total_lines: totalLines,
        });
      }

      await send({ type: "done" });
    } catch (err) {
      await send({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (inFlight.get(episodeId) === controller) inFlight.delete(episodeId);
    }
  });
});

pipelineRoute.post("/episodes/:id/export", async (c) => {
  const episodeId = c.req.param("id");
  const db = getDb();
  const epRow = db
    .prepare("SELECT * FROM episodes WHERE id = ?")
    .get(episodeId) as EpisodeRow | undefined;
  if (!epRow) return c.json({ error: "not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    variant?: "translation_only" | "bilingual";
  };
  const variant = body.variant ?? "translation_only";

  const lineRows = db
    .prepare(
      "SELECT * FROM subtitle_lines WHERE episode_id = ? ORDER BY idx ASC",
    )
    .all(episodeId) as LineRow[];

  const cfg = readConfig();
  const entries = lineRows.map((r) => {
    const translation = r.translation ?? "";
    let text: string;
    if (variant === "bilingual") {
      // English on top, source on bottom — typical for an English-speaking
      // audience that occasionally wants the source for reference.
      text = translation
        ? `${translation}\n${r.source_text}`
        : r.source_text;
    } else {
      text = translation;
    }
    return {
      idx: r.idx,
      start_ms: r.start_ms,
      end_ms: r.end_ms,
      text,
    };
  });

  // Derive a per-variant filename so bilingual and translation_only outputs
  // don't clobber each other.
  const sourceDir = path.dirname(epRow.source_srt_path);
  const sourceBase = path.basename(epRow.source_srt_path, ".srt");
  const suffix = variant === "bilingual" ? ".bilingual.srt" : ".eng.srt";
  let outputPath = path.join(sourceDir, `${sourceBase}${suffix}`);

  let conflictAction: "wrote" | "overwrote" | "incremented" | "skipped" =
    "wrote";
  if (fs.existsSync(outputPath)) {
    if (cfg.file_conflict_strategy === "skip") {
      return c.json(
        {
          error: "output file exists, strategy=skip",
          attempted_path: outputPath,
          strategy: cfg.file_conflict_strategy,
        },
        409,
      );
    }
    if (cfg.file_conflict_strategy === "increment") {
      const base = path.basename(outputPath, ".srt").replace(/\.\d+$/, "");
      let n = 2;
      let candidate = path.join(sourceDir, `${base}.${n}.srt`);
      while (fs.existsSync(candidate)) {
        n++;
        candidate = path.join(sourceDir, `${base}.${n}.srt`);
      }
      outputPath = candidate;
      conflictAction = "incremented";
    } else {
      conflictAction = "overwrote";
    }
  }

  fs.writeFileSync(outputPath, writeSrt(entries), "utf8");

  const now = Date.now();
  // Only stamp `exported_at` for the canonical translation_only output. A
  // bilingual export is a side artefact; status shouldn't flip on it alone.
  if (variant === "translation_only") {
    db.prepare(
      "UPDATE episodes SET exported_at = ?, output_srt_path = ?, updated_at = ? WHERE id = ?",
    ).run(now, outputPath, now, episodeId);
  }

  return c.json({
    ok: true,
    output_srt_path: outputPath,
    variant,
    strategy: cfg.file_conflict_strategy,
    action: conflictAction,
    exported_at: variant === "translation_only" ? now : null,
  });
});
