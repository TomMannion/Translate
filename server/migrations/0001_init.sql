PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  source_srt_path TEXT NOT NULL UNIQUE,
  output_srt_path TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',   -- JSON
  lines_count INTEGER NOT NULL DEFAULT 0,
  lines_translated_count INTEGER NOT NULL DEFAULT 0,
  lines_approved_count INTEGER NOT NULL DEFAULT 0,
  exported_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subtitle_lines (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translation TEXT,
  previous_translation TEXT,
  last_change_source TEXT,
  model TEXT,
  prompt_version TEXT,
  gemini_call_id TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(episode_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_lines_episode ON subtitle_lines(episode_id, idx);

CREATE TABLE IF NOT EXISTS context_docs (
  episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  markdown_content TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  edited_at INTEGER
);

CREATE TABLE IF NOT EXISTS gemini_calls (
  id TEXT PRIMARY KEY,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  thinking_tokens INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  created_at INTEGER NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_calls_episode ON gemini_calls(episode_id);
CREATE INDEX IF NOT EXISTS idx_calls_kind ON gemini_calls(kind);
