import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { getDb } from "../db.ts";
import { readConfig } from "../config.ts";
import { parseSrt } from "../srt/parse.ts";
import { deriveStatus, type EpisodeRow, type LineRow } from "../types.ts";
import type {
  Episode,
  EpisodeMetadata,
  ScanResult,
  SubtitleLine,
} from "../../../shared/types.ts";

export const episodesRoute = new Hono();

function rowToEpisode(row: EpisodeRow, hasContextDoc: boolean): Episode {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source_srt_path: row.source_srt_path,
    output_srt_path: row.output_srt_path,
    metadata: JSON.parse(row.metadata || "{}") as EpisodeMetadata,
    lines_count: row.lines_count,
    lines_translated_count: row.lines_translated_count,
    lines_approved_count: row.lines_approved_count,
    exported_at: row.exported_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_context_doc: hasContextDoc,
    status: deriveStatus(row, hasContextDoc),
  };
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

function listEpisodes(): Episode[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM episodes ORDER BY created_at DESC")
    .all() as EpisodeRow[];
  const ctxIds = new Set(
    (db
      .prepare("SELECT episode_id FROM context_docs")
      .all() as { episode_id: string }[]).map((r) => r.episode_id),
  );
  return rows.map((r) => rowToEpisode(r, ctxIds.has(r.id)));
}

function getEpisodeBundle(
  id: string,
): { episode: Episode; lines: SubtitleLine[]; context: string | null } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM episodes WHERE id = ?")
    .get(id) as EpisodeRow | undefined;
  if (!row) return null;
  const ctx = db
    .prepare("SELECT markdown_content FROM context_docs WHERE episode_id = ?")
    .get(id) as { markdown_content: string } | undefined;
  const lineRows = db
    .prepare(
      "SELECT * FROM subtitle_lines WHERE episode_id = ? ORDER BY idx ASC",
    )
    .all(id) as LineRow[];
  return {
    episode: rowToEpisode(row, !!ctx),
    lines: lineRows.map(rowToLine),
    context: ctx?.markdown_content ?? null,
  };
}

function deriveOutputPath(sourcePath: string, strategy: string): string {
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, ".srt");
  let candidate = path.join(dir, `${base}.eng.srt`);
  if (strategy !== "increment") return candidate;
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}.eng.${n}.srt`);
    n++;
  }
  return candidate;
}

episodesRoute.get("/", (c) => {
  return c.json(listEpisodes());
});

episodesRoute.get("/:id", (c) => {
  const bundle = getEpisodeBundle(c.req.param("id"));
  if (!bundle) return c.json({ error: "not found" }, 404);
  return c.json(bundle);
});

episodesRoute.delete("/:id", (c) => {
  const db = getDb();
  db.prepare("DELETE FROM episodes WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

episodesRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM episodes WHERE id = ?")
    .get(id) as EpisodeRow | undefined;
  if (!row) return c.json({ error: "not found" }, 404);
  const body = (await c.req.json()) as {
    title?: string;
    description?: string;
    metadata?: EpisodeMetadata;
  };
  const title = body.title ?? row.title;
  const description = body.description ?? row.description;
  const metadata = body.metadata
    ? JSON.stringify(body.metadata)
    : row.metadata;
  db.prepare(
    `UPDATE episodes SET title = ?, description = ?, metadata = ?, updated_at = ?
     WHERE id = ?`,
  ).run(title, description, metadata, Date.now(), id);
  const bundle = getEpisodeBundle(id)!;
  return c.json(bundle.episode);
});

episodesRoute.post("/scan", (c) => {
  const cfg = readConfig();
  const folder = cfg.library_folder_path;
  const result: ScanResult = { added: [], skipped: [] };
  if (!folder) {
    return c.json({ error: "library_folder_path not configured" }, 400);
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return c.json({ error: "library_folder_path is not a directory" }, 400);
  }

  const db = getDb();
  const entries = fs
    .readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith(".srt"))
    .filter((f) => !/\.eng(\.\d+)?\.srt$/i.test(f)); // skip our own outputs

  const existing = new Set(
    (db
      .prepare("SELECT source_srt_path FROM episodes")
      .all() as { source_srt_path: string }[]).map((r) => r.source_srt_path),
  );

  const insertEpisode = db.prepare(
    `INSERT INTO episodes (id, title, description, source_srt_path,
       output_srt_path, metadata, lines_count, lines_translated_count,
       lines_approved_count, exported_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO subtitle_lines (id, episode_id, idx, start_ms, end_ms,
       source_text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const f of entries) {
    const full = path.join(folder, f);
    if (existing.has(full)) {
      result.skipped.push({ path: full, reason: "already imported" });
      continue;
    }
    let parsed;
    try {
      parsed = parseSrt(fs.readFileSync(full, "utf8"));
    } catch (err) {
      result.skipped.push({
        path: full,
        reason: `parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const now = Date.now();
    const epId = crypto.randomUUID();
    const title = path.basename(f, ".srt");
    const outputPath = deriveOutputPath(full, cfg.file_conflict_strategy);

    const tx = db.transaction(() => {
      insertEpisode.run(
        epId,
        title,
        "",
        full,
        outputPath,
        JSON.stringify({}),
        parsed.length,
        now,
        now,
      );
      for (const entry of parsed) {
        insertLine.run(
          crypto.randomUUID(),
          epId,
          entry.idx,
          entry.start_ms,
          entry.end_ms,
          entry.text,
          now,
        );
      }
    });
    tx();

    const epRow = db
      .prepare("SELECT * FROM episodes WHERE id = ?")
      .get(epId) as EpisodeRow;
    result.added.push(rowToEpisode(epRow, false));
  }

  return c.json(result);
});
