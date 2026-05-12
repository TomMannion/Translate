import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  FileDown,
  Loader2,
  Play,
  Save,
  Sparkles,
} from "lucide-react";
import Button from "../components/Button.tsx";
import LineEditor from "../components/LineEditor.tsx";
import WorkflowStepper from "../components/WorkflowStepper.tsx";
import { api } from "../api.ts";
import { useTranslationStream } from "../hooks/useTranslationStream.ts";
import type {
  Episode,
  EpisodeMetadata,
  SubtitleLine,
} from "../../../shared/types.ts";

const STATUS_LABEL: Record<Episode["status"], string> = {
  draft: "Draft",
  metadata_ready: "Metadata ready",
  context_extracted: "Context extracted",
  translated: "Translated",
  reviewed: "Reviewed",
  exported: "Exported",
};

const STATUS_STYLE: Record<Episode["status"], string> = {
  draft: "bg-stone-100 text-stone-700",
  metadata_ready: "bg-blue-100 text-blue-800",
  context_extracted: "bg-indigo-100 text-indigo-800",
  translated: "bg-amber-100 text-amber-900",
  reviewed: "bg-emerald-100 text-emerald-800",
  exported: "bg-emerald-700 text-white",
};

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

  if (!episode) {
    return (
      <div className="flex items-center gap-2 text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading episode…
      </div>
    );
  }

  const translatedPct =
    episode.lines_count > 0
      ? Math.round(
          (episode.lines_translated_count / episode.lines_count) * 100,
        )
      : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {episode.title}
          </h1>
          <span
            className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[episode.status]}`}
          >
            {STATUS_LABEL[episode.status]}
          </span>
        </div>
        <p className="text-xs text-stone-500 font-mono truncate">
          {episode.source_srt_path}
        </p>
        <div className="flex items-center gap-4 text-xs text-stone-600">
          <span>{episode.lines_count} lines</span>
          <span>·</span>
          <span>
            {episode.lines_translated_count} translated ({translatedPct}%)
          </span>
          <span>·</span>
          <span>{episode.lines_approved_count} approved</span>
        </div>
        <WorkflowStepper status={episode.status} />
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

      <section id="lines" className="scroll-mt-20">
        <LineEditor
          lines={lines}
          onLineChanged={(updated) =>
            setLines((prev) =>
              prev.map((l) => (l.id === updated.id ? updated : l)),
            )
          }
          onBulkChanged={reload}
        />
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-xs text-stone-500 mt-0.5">{hint}</p>}
      </div>
      {right}
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
    <section
      id="metadata"
      className="scroll-mt-20 rounded-lg border border-stone-200 bg-white p-5 space-y-4"
    >
      <SectionHeader
        title="Metadata"
        hint="Used to seed the context extraction prompt."
        right={
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onSave}
              disabled={busy}
              icon={<Save className="h-3.5 w-3.5" />}
            >
              Save
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Title">
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Video type"
          hint={!m.video_type ? "Required to unlock context generation" : undefined}
        >
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            placeholder="e.g. brew tutorial, café visit, bean review"
            value={m.video_type ?? ""}
            onChange={(e) => set("video_type", e.target.value)}
          />
        </Field>
        <Field label="Equipment featured">
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            placeholder="e.g. Origami dripper, Comandante C40"
            value={m.equipment ?? ""}
            onChange={(e) => set("equipment", e.target.value)}
          />
        </Field>
        <Field label="Coffee / roaster featured">
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            placeholder="e.g. Onyx Coffee, Geisha"
            value={m.coffee_featured ?? ""}
            onChange={(e) => set("coffee_featured", e.target.value)}
          />
        </Field>
        <Field label="Guests">
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            value={m.guests ?? ""}
            onChange={(e) => set("guests", e.target.value)}
          />
        </Field>
        <Field label="Custom notes">
          <input
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            value={m.custom_notes ?? ""}
            onChange={(e) => set("custom_notes", e.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-stone-600">{label}</span>
        {hint && <span className="text-[10px] text-amber-700">{hint}</span>}
      </div>
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

  const dirty = useMemo(() => draft !== (context ?? ""), [draft, context]);

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
    <section
      id="context"
      className="scroll-mt-20 rounded-lg border border-stone-200 bg-white p-5 space-y-4"
    >
      <SectionHeader
        title="Context document"
        hint="Speakers, setting, tone, and per-episode glossary. Used by every translation call."
        right={
          <div className="flex items-center gap-2">
            <Button
              variant={context ? "secondary" : "primary"}
              size="sm"
              onClick={onGenerate}
              disabled={busy || !ready}
              icon={
                busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )
              }
              title={!ready ? "Set Video type in metadata first" : undefined}
            >
              {context ? "Re-generate" : "Generate"}
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={onSave}
              disabled={busy || !dirty}
              icon={<Save className="h-3.5 w-3.5" />}
            >
              Save edits
            </Button>
          </div>
        }
      />

      {!ready && (
        <InlineNote tone="amber">
          Fill in <strong>Video type</strong> above before generating context.
        </InlineNote>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {context || draft ? (
        <>
          <textarea
            className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            rows={18}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                dirty ? "text-amber-700" : "text-stone-500"
              }
            >
              {dirty
                ? "Unsaved changes — translation runs after this point use the saved version."
                : "Saved."}
            </span>
            {savedAt && (
              <span className="text-stone-400">
                Last saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-stone-500">
          Generate context to extract speakers, setting, tone, and a glossary
          from the transcript. The output is Markdown — review and edit it
          before running translation.
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
  const [exportAction, setExportAction] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async (variant: "translation_only" | "bilingual") => {
    setExportError(null);
    setExportPath(null);
    setExportAction(null);
    try {
      const result = await api.exportEpisode(episode.id, variant);
      setExportPath(result.output_srt_path);
      setExportAction(`${result.action} (strategy: ${result.strategy})`);
      onChanged();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };

  const pct =
    stream.state.totalLines > 0
      ? Math.round((stream.state.linesDone / stream.state.totalLines) * 100)
      : 0;

  return (
    <section
      id="translate"
      className="scroll-mt-20 rounded-lg border border-stone-200 bg-white p-5 space-y-4"
    >
      <SectionHeader
        title="Translation & export"
        hint="Chunked translation with overlap context. Resume from where you left off if interrupted."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={stream.start}
          disabled={stream.state.active}
          icon={
            stream.state.active ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )
          }
        >
          {stream.state.active
            ? "Translating…"
            : episode.lines_translated_count > 0
              ? "Continue translation"
              : "Translate"}
        </Button>
        {stream.state.active && (
          <Button
            variant="secondary"
            onClick={stream.cancel}
            icon={<Ban className="h-4 w-4" />}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => onExport("translation_only")}
          disabled={
            episode.lines_translated_count === 0 || stream.state.active
          }
          icon={<FileDown className="h-4 w-4" />}
        >
          Export .eng.srt
        </Button>
        <Button
          variant="ghost"
          onClick={() => onExport("bilingual")}
          disabled={
            episode.lines_translated_count === 0 || stream.state.active
          }
          icon={<FileDown className="h-4 w-4" />}
          title="Bilingual: English line followed by source on a second row"
        >
          Export .bilingual.srt
        </Button>
      </div>

      {!contextPresent && (
        <InlineNote tone="amber">
          No context document yet — translation will run without per-episode
          context. Generate one above for noticeably better results.
        </InlineNote>
      )}

      {(stream.state.active ||
        stream.state.status === "done" ||
        stream.state.status === "cancelled" ||
        stream.state.status === "error") && (
        <div className="space-y-2 rounded-md bg-stone-50 border border-stone-200 px-3 py-2">
          <div className="flex items-center justify-between text-xs text-stone-600">
            <span>
              Chunk <strong>{stream.state.chunk}</strong> /{" "}
              {stream.state.totalChunks} ·{" "}
              <strong>{stream.state.linesDone}</strong> /{" "}
              {stream.state.totalLines} lines
            </span>
            <StreamStatusPill status={stream.state.status} />
          </div>
          <div className="h-1.5 rounded-full bg-white overflow-hidden border border-stone-200">
            <div
              className="h-full bg-amber-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {stream.state.error && (
            <p className="text-xs text-red-700">{stream.state.error}</p>
          )}
        </div>
      )}

      {exportPath && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">
              {exportAction ?? "wrote"}
            </div>
            <div className="font-mono text-xs truncate">{exportPath}</div>
          </div>
        </div>
      )}
      {exportError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}
    </section>
  );
}

function StreamStatusPill({
  status,
}: {
  status: ReturnType<typeof useTranslationStream>["state"]["status"];
}) {
  const tone: Record<typeof status, string> = {
    idle: "bg-stone-100 text-stone-600",
    running: "bg-amber-100 text-amber-800",
    done: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-stone-200 text-stone-700",
    error: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${tone[status]}`}
    >
      {status}
    </span>
  );
}

function InlineNote({
  tone,
  children,
}: {
  tone: "amber";
  children: React.ReactNode;
}) {
  const cls = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${cls}`}
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

