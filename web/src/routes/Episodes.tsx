import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.ts";
import type {
  DerivedStatus,
  Episode,
  ScanResult,
} from "../../../shared/types.ts";

type StatusFilter = "all" | DerivedStatus;

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Episodes</h1>
        <button
          onClick={onScan}
          disabled={busy}
          className="rounded bg-stone-900 text-white px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Scanning…" : "Scan folder"}
        </button>
      </div>

      {episodes && episodes.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
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
              className={`rounded-full px-3 py-1 text-xs ${
                filter === s
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              {s} ({counts[s]})
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800 text-sm">
          {error}
        </div>
      )}

      {scanResult && (
        <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          Added {scanResult.added.length}, skipped {scanResult.skipped.length}.
          {scanResult.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-stone-600">
              {scanResult.skipped.slice(0, 5).map((s) => (
                <li key={s.path}>
                  {s.path}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {episodes === null ? (
        <p>Loading…</p>
      ) : episodes.length === 0 ? (
        <p className="text-stone-500">
          No episodes yet. Set a library folder in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>{" "}
          and click <strong>Scan folder</strong>.
        </p>
      ) : visible && visible.length === 0 ? (
        <p className="text-stone-500 text-sm">
          No episodes match this filter.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {visible!.map((ep) => (
            <li key={ep.id} className="px-4 py-3 hover:bg-stone-50">
              <Link to={`/episodes/${ep.id}`} className="block">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{ep.title}</span>
                  <StatusBadge status={ep.status} />
                </div>
                <div className="text-xs text-stone-500 mt-0.5 font-mono truncate">
                  {ep.source_srt_path}
                </div>
                <div className="text-xs text-stone-600 mt-1">
                  {ep.lines_count} lines · {ep.lines_translated_count}{" "}
                  translated · {ep.lines_approved_count} approved
                  {ep.exported_at &&
                    ` · exported ${new Date(ep.exported_at).toLocaleString()}`}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Episode["status"] }) {
  const color: Record<Episode["status"], string> = {
    draft: "bg-stone-100 text-stone-700",
    metadata_ready: "bg-blue-100 text-blue-800",
    context_extracted: "bg-indigo-100 text-indigo-800",
    translated: "bg-amber-100 text-amber-800",
    reviewed: "bg-emerald-100 text-emerald-800",
    exported: "bg-emerald-700 text-white",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${color[status]}`}
    >
      {status}
    </span>
  );
}
