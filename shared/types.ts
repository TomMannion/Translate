// Shared request/response shapes between server and web.
// Both server/tsconfig.json and web/tsconfig.json include "../shared".

export type ThinkingLevel = "low" | "medium" | "high";
export type FileConflictStrategy = "overwrite" | "skip" | "increment";

export interface AppConfig {
  gemini_api_key: string;
  library_folder_path: string;
  file_conflict_strategy: FileConflictStrategy;
  default_thinking_level: ThinkingLevel;
  chunk_size_lines: number;
  model_alias: string;
}

export interface PublicAppConfig {
  library_folder_path: string;
  file_conflict_strategy: FileConflictStrategy;
  default_thinking_level: ThinkingLevel;
  chunk_size_lines: number;
  model_alias: string;
  api_key_configured: boolean;
}

export interface EpisodeMetadata {
  equipment?: string;
  coffee_featured?: string;
  guests?: string;
  video_type?: string;
  custom_notes?: string;
}

export type DerivedStatus =
  | "draft"
  | "metadata_ready"
  | "context_extracted"
  | "translated"
  | "reviewed"
  | "exported";

export interface Episode {
  id: string;
  title: string;
  description: string;
  source_srt_path: string;
  output_srt_path: string;
  metadata: EpisodeMetadata;
  lines_count: number;
  lines_translated_count: number;
  lines_approved_count: number;
  exported_at: number | null;
  created_at: number;
  updated_at: number;
  has_context_doc: boolean;
  status: DerivedStatus;
}

export interface SubtitleLine {
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

export interface ContextDoc {
  episode_id: string;
  markdown_content: string;
  generated_at: number;
  edited_at: number | null;
}

export interface ScanResult {
  added: Episode[];
  skipped: { path: string; reason: string }[];
}

export interface TestKeyResult {
  ok: boolean;
  model?: string;
  error?: string;
}

export interface FolderProbeResult {
  valid: boolean;
  is_dir: boolean;
  has_srt_files: boolean;
  sample_files: string[];
  error?: string;
}

export interface UsageTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cost_usd: number;
}

export interface UsageByEpisode extends UsageTotals {
  episode_id: string | null;
  episode_title: string | null;
}

export interface UsageByKind extends UsageTotals {
  kind: "context" | "translate" | "retranslate" | "test";
}

export interface UsageByModel extends UsageTotals {
  model: string;
}

export interface ModelRates {
  input_per_mtok: number;
  output_per_mtok: number;
  thinking_per_mtok: number;
}

export interface PricingSnapshot {
  default: ModelRates;
  models: Record<string, ModelRates>;
}

export interface UsageReport {
  totals: UsageTotals;
  by_episode: UsageByEpisode[];
  by_kind: UsageByKind[];
  by_model: UsageByModel[];
  pricing: PricingSnapshot;
  last_call_at: number | null;
}

// SSE event payloads emitted by /api/episodes/:id/events during translation.
export type TranslationEvent =
  | { type: "start"; total_chunks: number; total_lines: number }
  | {
      type: "chunk_complete";
      chunk: number;
      of: number;
      lines_done: number;
      total_lines: number;
    }
  | { type: "chunk_error"; chunk: number; error: string }
  | { type: "done" }
  | { type: "cancelled" }
  | { type: "error"; error: string };
