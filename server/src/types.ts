// Internal server-only types (row shapes). The cross-process contract lives
// in ../../shared/types.ts.

import type { DerivedStatus, EpisodeMetadata } from "../../shared/types.ts";

export interface EpisodeRow {
  id: string;
  title: string;
  description: string;
  source_srt_path: string;
  output_srt_path: string;
  metadata: string; // JSON
  lines_count: number;
  lines_translated_count: number;
  lines_approved_count: number;
  exported_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface LineRow {
  id: string;
  episode_id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  source_text: string;
  translation: string | null;
  previous_translation: string | null;
  last_change_source: "initial" | "user_edit" | "re_translate" | null;
  model: string | null;
  prompt_version: string | null;
  gemini_call_id: string | null;
  approved: 0 | 1;
  updated_at: number;
}

export function deriveStatus(row: EpisodeRow, hasContextDoc: boolean): DerivedStatus {
  const metadata = JSON.parse(row.metadata || "{}") as EpisodeMetadata;
  if (!metadata.video_type) return "draft";
  if (!hasContextDoc) return "metadata_ready";
  if (row.lines_translated_count === 0) return "context_extracted";
  if (
    row.lines_count > 0 &&
    row.lines_approved_count === row.lines_count
  ) {
    return row.exported_at ? "exported" : "reviewed";
  }
  return "translated";
}
