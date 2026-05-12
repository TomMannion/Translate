import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.ts";
import { useTranslationStream } from "../hooks/useTranslationStream.ts";
import LineEditor from "../components/LineEditor.tsx";
import type {
  Episode,
  EpisodeMetadata,
  SubtitleLine,
} from "../../../shared/types.ts";

export default function EpisodeDetail() {
  const { id } = useParams<{ id: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [context, setContext] = useState<string | null>(null);
  const stream = useTranslationStream(id ?? null);

  const reload = useCallback(async () => {
    if (!id) return;
    const data = await api.getEpisode(id);
    setEpisode(data.episode);
    setLines(data.lines);
    setContext(data.context);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (stream.state.status === "done" || stream.state.status === "cancelled") {
      void reload();
    }
  }, [stream.state.status, reload]);

  if (!episode) return <p>Loading…</p>;

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
          <span className="ml-2 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
            {episode.status}
          </span>
        </p>
      </header>

      <MetadataForm episode={episode} onSaved={reload} />

      <ContextSection
        episodeId={episode.id}
        context={context}
        onUpdated={(md) => setContext(md)}
        ready={!!episode.metadata.video_type}
      />

      <TranslateSection
        episode={episode}
        stream={stream}
        contextPresent={!!context}
        onChanged={reload}
      />

      <LineEditor
        lines={lines}
        onLineChanged={(updated) =>
          setLines((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l)),
          )
        }
        onBulkChanged={reload}
      />
    </div>
  );
}

function MetadataForm({
  episode,
  onSaved,
}: {
  episode: Episode;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description);
  const [m, setM] = useState<EpisodeMetadata>(episode.metadata);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setTitle(episode.title);
    setDescription(episode.description);
    setM(episode.metadata);
  }, [episode]);

  const onSave = async () => {
    setBusy(true);
    try {
      await api.updateEpisode(episode.id, {
        title,
        description,
        metadata: m,
      });
      setSavedAt(Date.now());
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof EpisodeMetadata>(
    key: K,
    value: EpisodeMetadata[K],
  ) => setM((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="rounded border border-stone-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
        Episode metadata
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title">
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Video type">
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="e.g. brew tutorial, café visit, bean review"
            value={m.video_type ?? ""}
            onChange={(e) => set("video_type", e.target.value)}
          />
        </Field>
        <Field label="Equipment featured">
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="e.g. Origami dripper, Comandante C40"
            value={m.equipment ?? ""}
            onChange={(e) => set("equipment", e.target.value)}
          />
        </Field>
        <Field label="Coffee / roaster featured">
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="e.g. Onyx Coffee, Geisha"
            value={m.coffee_featured ?? ""}
            onChange={(e) => set("coffee_featured", e.target.value)}
          />
        </Field>
        <Field label="Guests">
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5"
            value={m.guests ?? ""}
            onChange={(e) => set("guests", e.target.value)}
          />
        </Field>
        <Field label="Custom notes">
          <input
            className="w-full rounded border border-stone-300 px-2 py-1.5"
            value={m.custom_notes ?? ""}
            onChange={(e) => set("custom_notes", e.target.value)}
          />
        </Field>
        <Field label="Description" wide>
          <textarea
            className="w-full rounded border border-stone-300 px-2 py-1.5 font-sans"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={busy}
          className="rounded bg-stone-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Save metadata
        </button>
        {savedAt && (
          <span className="text-xs text-stone-500">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        {!m.video_type && (
          <span className="text-xs text-amber-700">
            Set <strong>Video type</strong> to advance status to{" "}
            <code>metadata_ready</code>.
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-stone-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function ContextSection({
  episodeId,
  context,
  onUpdated,
  ready,
}: {
  episodeId: string;
  context: string | null;
  onUpdated: (md: string) => void;
  ready: boolean;
}) {
  const [draft, setDraft] = useState(context ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setDraft(context ?? "");
  }, [context]);

  const dirty = useMemo(
    () => draft !== (context ?? ""),
    [draft, context],
  );

  const onGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.extractContext(episodeId);
      onUpdated(result.markdown_content);
      setDraft(result.markdown_content);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.saveContext(episodeId, draft);
      onUpdated(result.markdown_content);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Episode context
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerate}
            disabled={busy || !ready}
            className="rounded bg-indigo-700 text-white px-3 py-1.5 text-sm disabled:opacity-50"
            title={!ready ? "Set Video type in metadata first" : ""}
          >
            {context ? "Re-generate" : "Generate context"}
          </button>
          <button
            onClick={onSave}
            disabled={busy || !dirty}
            className="rounded bg-emerald-700 text-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Save edits
          </button>
        </div>
      </div>

      {!ready && (
        <p className="text-sm text-amber-700">
          Fill in metadata (especially Video type) before generating context.
        </p>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {context || draft ? (
        <>
          <textarea
            className="w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
            rows={18}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>
              {dirty
                ? "Unsaved changes — edits will be used by the next translation run."
                : "Saved."}
            </span>
            {savedAt && (
              <span>Saved {new Date(savedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-stone-500">
          Generate context to extract speakers, setting, tone, and glossary
          from the transcript. You'll be able to edit the Markdown before
          translation.
        </p>
      )}
    </section>
  );
}

function TranslateSection({
  episode,
  stream,
  contextPresent,
  onChanged,
}: {
  episode: Episode;
  stream: ReturnType<typeof useTranslationStream>;
  contextPresent: boolean;
  onChanged: () => void;
}) {
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async () => {
    setExportError(null);
    setExportPath(null);
    try {
      const result = await api.exportEpisode(episode.id);
      setExportPath(result.output_srt_path);
      onChanged();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };

  const pct =
    stream.state.totalLines > 0
      ? Math.round(
          (stream.state.linesDone / stream.state.totalLines) * 100,
        )
      : 0;

  return (
    <section className="rounded border border-stone-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
        Translation
      </h2>
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
        {!contextPresent && (
          <span className="text-xs text-amber-700">
            No context doc yet — translation will run without per-episode context.
          </span>
        )}
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
          Wrote <code className="font-mono">{exportPath}</code>
        </p>
      )}
      {exportError && <p className="text-sm text-red-700">{exportError}</p>}
    </section>
  );
}

