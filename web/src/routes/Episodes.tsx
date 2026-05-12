import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ChevronRight,
  FolderSearch,
  Loader2,
} from "lucide-react";
import Button from "../components/Button.tsx";
import { api } from "../api.ts";
import type {
  DerivedStatus,
  Episode,
  ScanResult,
} from "../../../shared/types.ts";

type StatusFilter = "all" | DerivedStatus;

const STATUS_LABEL: Record<DerivedStatus, string> = {
  draft: "Draft",
  metadata_ready: "Metadata ready",
  context_extracted: "Context extracted",
  translated: "Translated",
  reviewed: "Reviewed",
  exported: "Exported",
};

const STATUS_STYLE: Record<DerivedStatus, string> = {
  draft: "bg-stone-100 text-stone-700",
  metadata_ready: "bg-blue-100 text-blue-800",
  context_extracted: "bg-indigo-100 text-indigo-800",
  translated: "bg-amber-100 text-amber-900",
  reviewed: "bg-emerald-100 text-emerald-800",
  exported: "bg-emerald-700 text-white",
};

export default function Episodes() {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = async () => {
    setError(null);
    try {
      setEpisodes(await api.listEpisodes());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onScan = async () => {
    setBusy(true);
    setError(null);
    setScanResult(null);
    try {
      const result = await api.scanEpisodes();
      setScanResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<DerivedStatus | "all", number> = {
      all: 0,
      draft: 0,
      metadata_ready: 0,
      context_extracted: 0,
      translated: 0,
      reviewed: 0,
      exported: 0,
    };
    for (const e of episodes ?? []) {
      c.all += 1;
      c[e.status] += 1;
    }
    return c;
  }, [episodes]);

  const visible = useMemo(() => {
    if (!episodes) return null;
    if (filter === "all") return episodes;
    return episodes.filter((e) => e.status === filter);
  }, [episodes, filter]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Episodes</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Drop Cantonese <code className="font-mono text-xs">.srt</code> files
            into the library folder, then scan.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={onScan}
          disabled={busy}
          icon={
            busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderSearch className="h-4 w-4" />
            )
          }
        >
          {busy ? "Scanning…" : "Scan folder"}
        </Button>
      </header>

      {error && <ErrorBanner message={error} />}

      {scanResult && (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
          <p>
            Added <strong>{scanResult.added.length}</strong>, skipped{" "}
            <strong>{scanResult.skipped.length}</strong>.
          </p>
          {scanResult.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-stone-600 text-xs space-y-0.5">
              {scanResult.skipped.slice(0, 5).map((s) => (
                <li key={s.path}>
                  <span className="font-mono">{s.path}</span>: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {episodes && episodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              "all",
              "draft",
              "metadata_ready",
              "context_extracted",
              "translated",
              "reviewed",
              "exported",
            ] as StatusFilter[]
          ).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === s
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}{" "}
              <span className={filter === s ? "opacity-70" : "text-stone-400"}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      )}

      {episodes === null ? (
        <SkeletonList />
      ) : episodes.length === 0 ? (
        <EmptyState />
      ) : visible && visible.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-stone-500">
            No episodes match this filter.
          </p>
          <button
            onClick={() => setFilter("all")}
            className="mt-2 text-sm text-amber-700 hover:text-amber-800"
          >
            Show all
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible!.map((ep) => (
            <EpisodeCard key={ep.id} episode={ep} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EpisodeCard({ episode: ep }: { episode: Episode }) {
  const progressPct =
    ep.lines_count > 0
      ? Math.round((ep.lines_approved_count / ep.lines_count) * 100)
      : 0;
  return (
    <li>
      <Link
        to={`/episodes/${ep.id}`}
        className="group block rounded-lg border border-stone-200 bg-white px-4 py-3 hover:border-stone-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-medium truncate">{ep.title}</h2>
              <span
                className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[ep.status]}`}
              >
                {STATUS_LABEL[ep.status]}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-500 font-mono truncate">
              {ep.source_srt_path}
            </p>
            <div className="mt-2 flex items-center gap-4 text-xs text-stone-600">
              <span>
                <strong>{ep.lines_count}</strong> lines
              </span>
              <span>
                <strong>{ep.lines_translated_count}</strong> translated
              </span>
              <span>
                <strong>{ep.lines_approved_count}</strong> approved
              </span>
              {ep.exported_at && (
                <span className="text-emerald-700">
                  exported {new Date(ep.exported_at).toLocaleDateString()}
                </span>
              )}
            </div>
            {ep.lines_count > 0 && (
              <div className="mt-2 h-1 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-stone-300 group-hover:text-stone-500 transition-colors mt-0.5" />
        </div>
      </Link>
    </li>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="rounded-lg border border-stone-200 bg-white px-4 py-3"
        >
          <div className="h-4 w-1/3 bg-stone-100 rounded animate-pulse" />
          <div className="mt-2 h-3 w-2/3 bg-stone-100 rounded animate-pulse" />
          <div className="mt-3 h-1 w-full bg-stone-100 rounded animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-stone-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-amber-50 text-amber-700">
        <FolderSearch className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">No episodes yet</h3>
      <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
        Configure a library folder in{" "}
        <Link to="/settings" className="text-amber-700 hover:text-amber-800">
          Settings
        </Link>
        , drop your <code className="font-mono text-xs">.srt</code> files in,
        then click <strong>Scan folder</strong>.
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

