import { Hono } from "hono";
import { getDb } from "../db.ts";
import { retranslateLine } from "../llm/retranslate.ts";
import { wrapSubtitle } from "../srt/normalize.ts";
import { GeminiError } from "../llm/gemini.ts";
import type { LineRow } from "../types.ts";
import type { SubtitleLine } from "../../../shared/types.ts";

export const linesRoute = new Hono();

function getLine(id: string): LineRow | undefined {
  return getDb()
    .prepare("SELECT * FROM subtitle_lines WHERE id = ?")
    .get(id) as LineRow | undefined;
}

function rowToLine(row: LineRow): SubtitleLine {
  return {
    id: row.id,
    episode_id: row.episode_id,
    idx: row.idx,
    start_ms: row.start_ms,
    end_ms: row.end_ms,
    source_text: row.source_text,
    translation: row.translation,
    previous_translation: row.previous_translation,
    last_change_source: row.last_change_source,
    model: row.model,
    prompt_version: row.prompt_version,
    gemini_call_id: row.gemini_call_id,
    approved: row.approved,
    updated_at: row.updated_at,
  };
}

function recomputeEpisodeCounts(episodeId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE episodes SET
       lines_translated_count = (
         SELECT COUNT(*) FROM subtitle_lines
         WHERE episode_id = ? AND translation IS NOT NULL
       ),
       lines_approved_count = (
         SELECT COUNT(*) FROM subtitle_lines
         WHERE episode_id = ? AND approved = 1
       ),
       updated_at = ?
     WHERE id = ?`,
  ).run(episodeId, episodeId, Date.now(), episodeId);
}

linesRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = getLine(id);
  if (!existing) return c.json({ error: "not found" }, 404);

  const body = (await c.req.json()) as { translation?: string };
  if (typeof body.translation !== "string") {
    return c.json({ error: "translation required" }, 400);
  }
  if (body.translation === existing.translation) {
    return c.json({ line: rowToLine(existing) }); // no-op
  }

  const now = Date.now();
  const db = getDb();
  db.prepare(
    `UPDATE subtitle_lines SET
       previous_translation = translation,
       translation = ?,
       last_change_source = 'user_edit',
       model = NULL,
       prompt_version = NULL,
       gemini_call_id = NULL,
       approved = 0,
       updated_at = ?
     WHERE id = ?`,
  ).run(body.translation, now, id);
  recomputeEpisodeCounts(existing.episode_id);

  return c.json({ line: rowToLine(getLine(id)!) });
});

linesRoute.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  const existing = getLine(id);
  if (!existing) return c.json({ error: "not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { approved?: boolean };
  const approved = body.approved === undefined ? !existing.approved : !!body.approved;

  if (approved && existing.translation === null) {
    return c.json({ error: "cannot approve a line with no translation" }, 400);
  }

  const now = Date.now();
  getDb()
    .prepare(
      "UPDATE subtitle_lines SET approved = ?, updated_at = ? WHERE id = ?",
    )
    .run(approved ? 1 : 0, now, id);
  recomputeEpisodeCounts(existing.episode_id);
  return c.json({ line: rowToLine(getLine(id)!) });
});

linesRoute.post("/:id/undo", (c) => {
  const id = c.req.param("id");
  const existing = getLine(id);
  if (!existing) return c.json({ error: "not found" }, 404);
  if (existing.previous_translation === null) {
    return c.json({ error: "nothing to undo" }, 400);
  }

  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE subtitle_lines SET
         translation = previous_translation,
         previous_translation = translation,
         last_change_source = 'user_edit',
         approved = 0,
         updated_at = ?
       WHERE id = ?`,
    )
    .run(now, id);
  recomputeEpisodeCounts(existing.episode_id);
  return c.json({ line: rowToLine(getLine(id)!) });
});

linesRoute.post("/:id/retranslate", async (c) => {
  const id = c.req.param("id");
  const existing = getLine(id);
  if (!existing) return c.json({ error: "not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { hint?: string };
  const hint = (body.hint ?? "").trim();

  const db = getDb();
  const neighbours = db
    .prepare(
      `SELECT * FROM subtitle_lines
       WHERE episode_id = ? AND idx BETWEEN ? AND ?
       ORDER BY idx ASC`,
    )
    .all(existing.episode_id, existing.idx - 3, existing.idx + 3) as LineRow[];

  const contextRow = db
    .prepare(
      "SELECT markdown_content FROM context_docs WHERE episode_id = ?",
    )
    .get(existing.episode_id) as { markdown_content: string } | undefined;

  try {
    const result = await retranslateLine({
      episodeId: existing.episode_id,
      target: existing,
      neighbours,
      contextDoc: contextRow?.markdown_content ?? "",
      hint,
    });
    const wrapped = wrapSubtitle(result.text);
    const now = Date.now();
    db.prepare(
      `UPDATE subtitle_lines SET
         previous_translation = translation,
         translation = ?,
         last_change_source = 're_translate',
         model = ?,
         prompt_version = ?,
         gemini_call_id = ?,
         approved = 0,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      wrapped,
      result.model,
      result.promptVersion,
      result.callId,
      now,
      id,
    );
    recomputeEpisodeCounts(existing.episode_id);
    return c.json({ line: rowToLine(getLine(id)!) });
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

linesRoute.post("/bulk-replace", async (c) => {
  const body = (await c.req.json()) as {
    episode_id?: string;
    find?: string;
    replace?: string;
    case_sensitive?: boolean;
    whole_word?: boolean;
  };
  if (!body.episode_id || !body.find) {
    return c.json({ error: "episode_id and find required" }, 400);
  }
  const replace = body.replace ?? "";
  const caseSensitive = !!body.case_sensitive;
  const wholeWord = !!body.whole_word;

  // Escape regex metacharacters in `find`; we never accept user regex here.
  const escaped = body.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const flags = caseSensitive ? "g" : "gi";
  const re = new RegExp(pattern, flags);

  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM subtitle_lines WHERE episode_id = ? AND translation IS NOT NULL",
    )
    .all(body.episode_id) as LineRow[];

  const update = db.prepare(
    `UPDATE subtitle_lines SET
       previous_translation = translation,
       translation = ?,
       last_change_source = 'user_edit',
       approved = 0,
       updated_at = ?
     WHERE id = ?`,
  );

  let modified = 0;
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (row.translation === null) continue;
      if (!re.test(row.translation)) {
        re.lastIndex = 0;
        continue;
      }
      re.lastIndex = 0;
      const next = row.translation.replace(re, replace);
      if (next !== row.translation) {
        update.run(next, now, row.id);
        modified += 1;
      }
    }
  });
  tx();

  recomputeEpisodeCounts(body.episode_id);
  return c.json({ modified });
});
