import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.ts";
import { useTranslationStream } from "../hooks/useTranslationStream.ts";
import type { Episode, SubtitleLine } from "../../../shared/types.ts";

export default function EpisodeDetail() {
  const { id } = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const stream = useTranslationStream(id ?? null);

  const reload = useCallback(async () => {
    if (!id) return;
    const data = await api.getEpisode(id);
    setEpisode(data.episode);
    setLines(data.lines);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (stream.state.status === "done" || stream.state.status === "cancelled") {
      void reload();
    }
  }, [stream.state.status, reload]);

  const onExport = async () => {
    if (!id) return;
    setExportError(null);
    setExportPath(null);
    try {
      const result = await api.exportEpisode(id);
      setExportPath(result.output_srt_path);
      void reload();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!episode) return <p>Loading…</p>;

  const pct =
    stream.state.totalLines > 0
      ? Math.round((stream.state.linesDone / stream.state.totalLines) * 100)
      : 0;
  const translatedPct =
    episode.lines_count > 0
      ? Math.round(
          (episode.lines_translated_count / episode.lines_count) * 100,
        )
      : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{episode.title}</h1>
        <p className="text-sm text-stone-500 font-mono">
          {episode.source_srt_path}
        </p>
        <p className="text-sm text-stone-600">
          {episode.lines_count} lines · {episode.lines_translated_count}{" "}
          translated ({translatedPct}%)
        </p>
      </header>

      <section className="rounded border border-stone-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={stream.start}
            disabled={stream.state.active}
            className="rounded bg-emerald-700 text-white px-4 py-2 disabled:opacity-50"
          >
            {stream.state.active
              ? "Translating…"
              : episode.lines_translated_count > 0
                ? "Continue translation"
                : "Translate"}
          </button>
          {stream.state.active && (
            <button
              onClick={stream.cancel}
              className="rounded border border-stone-300 px-3 py-2"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onExport}
            disabled={
              episode.lines_translated_count === 0 || stream.state.active
            }
            className="rounded bg-stone-900 text-white px-4 py-2 disabled:opacity-50"
          >
            Export .eng.srt
          </button>
        </div>

        {(stream.state.active ||
          stream.state.status === "done" ||
          stream.state.status === "cancelled" ||
          stream.state.status === "error") && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-stone-600">
              <span>
                Chunk {stream.state.chunk} / {stream.state.totalChunks} ·{" "}
                {stream.state.linesDone} / {stream.state.totalLines} lines
              </span>
              <span className="capitalize">{stream.state.status}</span>
            </div>
            <div className="h-2 rounded bg-stone-200 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {stream.state.error && (
              <p className="text-sm text-red-700">{stream.state.error}</p>
            )}
          </div>
        )}

        {exportPath && (
          <p className="text-sm text-emerald-700">
            Wrote{" "}
            <code className="font-mono">{exportPath}</code>
          </p>
        )}
        {exportError && (
          <p className="text-sm text-red-700">{exportError}</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide mb-2">
          Lines (read-only preview)
        </h2>
        <div className="rounded border border-stone-200 bg-white divide-y divide-stone-100">
          {lines.slice(0, 50).map((l) => (
            <div key={l.id} className="px-3 py-2 grid grid-cols-12 gap-3">
              <div className="col-span-2 text-xs font-mono text-stone-500">
                #{l.idx}
                <br />
                {formatTs(l.start_ms)}
              </div>
              <div className="col-span-5 text-sm whitespace-pre-wrap">
                {l.source_text}
              </div>
              <div className="col-span-5 text-sm whitespace-pre-wrap text-stone-700">
                {l.translation ?? <span className="text-stone-400">—</span>}
              </div>
            </div>
          ))}
          {lines.length > 50 && (
            <div className="px-3 py-2 text-xs text-stone-500">
              … {lines.length - 50} more lines (full editor lands in Phase 3)
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatTs(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
