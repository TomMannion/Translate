import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleSlash,
  Keyboard,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Button from "./Button.tsx";
import { api } from "../api.ts";
import type { SubtitleLine } from "../../../shared/types.ts";

interface Props {
  lines: SubtitleLine[];
  onLineChanged: (line: SubtitleLine) => void;
  onBulkChanged: () => void;
}

export default function LineEditor({
  lines,
  onLineChanged,
  onBulkChanged,
}: Props) {
  const [filter, setFilter] = useState<"all" | "unapproved" | "untranslated">(
    "all",
  );
  const [showHelp, setShowHelp] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => {
    if (filter === "unapproved") {
      return lines.filter((l) => l.translation !== null && !l.approved);
    }
    if (filter === "untranslated") {
      return lines.filter((l) => l.translation === null);
    }
    return lines;
  }, [lines, filter]);

  const counts = useMemo(
    () => ({
      all: lines.length,
      unapproved: lines.filter((l) => l.translation !== null && !l.approved)
        .length,
      untranslated: lines.filter((l) => l.translation === null).length,
    }),
    [lines],
  );

  const jumpToNextUnapproved = useCallback(
    (fromIdx?: number) => {
      const active = document.activeElement as HTMLElement | null;
      let cursorIdx = fromIdx ?? -1;
      if (fromIdx === undefined && active?.dataset?.lineIdx) {
        cursorIdx = Number(active.dataset.lineIdx);
      }
      const next = lines.find(
        (l) => l.translation !== null && !l.approved && l.idx > cursorIdx,
      );
      if (!next) return;
      const el = containerRef.current?.querySelector<HTMLTextAreaElement>(
        `textarea[data-line-id="${next.id}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    },
    [lines],
  );

  // Global keyboard shortcuts (only when not inside an editable field).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        (target as HTMLElement)?.isContentEditable;
      if (editable) return;
      if (e.key === "j") {
        e.preventDefault();
        jumpToNextUnapproved();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowHelp((s) => !s);
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [jumpToNextUnapproved]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Lines</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Edit, approve, or re-translate with a hint. Tab between rows.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
            count={counts.all}
          />
          <FilterChip
            active={filter === "unapproved"}
            onClick={() => setFilter("unapproved")}
            label="Unapproved"
            count={counts.unapproved}
          />
          <FilterChip
            active={filter === "untranslated"}
            onClick={() => setFilter("untranslated")}
            label="Untranslated"
            count={counts.untranslated}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => jumpToNextUnapproved()}
            icon={<ArrowDown className="h-3.5 w-3.5" />}
            title="Jump to next unapproved (j)"
          >
            Next (j)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHelp(true)}
            icon={<Keyboard className="h-3.5 w-3.5" />}
            title="Keyboard shortcuts (?)"
          >
            Shortcuts
          </Button>
        </div>
      </div>

      <BulkReplace
        episodeId={lines[0]?.episode_id ?? null}
        onApplied={onBulkChanged}
      />

      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}

      <div
        ref={containerRef}
        className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden"
      >
        <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500 font-medium border-b border-stone-200">
          <div className="col-span-2">Idx · time</div>
          <div className="col-span-4">Source (Cantonese)</div>
          <div className="col-span-6">Translation (English)</div>
        </div>
        {visible.map((l) => (
          <LineRow key={l.id} line={l} onChanged={onLineChanged} />
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-6 text-sm text-stone-500 text-center">
            No matching lines.
          </p>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-stone-900 text-white"
          : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
      }`}
    >
      {label}{" "}
      <span className={active ? "opacity-70" : "text-stone-400"}>{count}</span>
    </button>
  );
}

function LineRow({
  line,
  onChanged,
}: {
  line: SubtitleLine;
  onChanged: (l: SubtitleLine) => void;
}) {
  const [draft, setDraft] = useState(line.translation ?? "");
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(line.translation ?? "");
  }, [line.translation]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [draft]);

  const dirty = draft !== (line.translation ?? "");

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.updateLine(line.id, draft);
      onChanged(r.line);
      setSavedTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleApprove = async () => {
    if (line.translation === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.setApproval(line.id, !line.approved);
      onChanged(r.line);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.undoLine(line.id);
      onChanged(r.line);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const retranslate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.retranslateLine(line.id, hint);
      onChanged(r.line);
      setShowHint(false);
      setHint("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        if (dirty) {
          const updated = await api.updateLine(line.id, draft);
          onChanged(updated.line);
        }
        const approved = await api.setApproval(line.id, true);
        onChanged(approved.line);
        const all = Array.from(
          document.querySelectorAll<HTMLTextAreaElement>(
            "textarea[data-line-idx]",
          ),
        );
        const next = all.find(
          (ta) =>
            Number(ta.dataset.lineIdx) > line.idx &&
            ta.dataset.approved === "false",
        );
        if (next) {
          next.scrollIntoView({ behavior: "smooth", block: "center" });
          next.focus();
        } else {
          e.currentTarget.blur();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    } else if (e.key === "Escape") {
      setDraft(line.translation ?? "");
      e.currentTarget.blur();
    }
  };

  return (
    <div
      className={`group grid grid-cols-12 gap-3 px-3 py-2.5 transition-colors items-start ${
        line.approved ? "bg-emerald-50/30" : "hover:bg-stone-50/60"
      }`}
    >
      <div className="col-span-2 text-xs font-mono text-stone-500 leading-snug">
        <div className="font-semibold text-stone-700">#{line.idx}</div>
        <div>{formatTs(line.start_ms)}</div>
        {line.last_change_source && (
          <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] uppercase tracking-wide rounded bg-stone-100 text-stone-500">
            {line.last_change_source.replace("_", " ")}
          </span>
        )}
      </div>
      <div className="col-span-4 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
        {line.source_text}
      </div>
      <div className="col-span-6 space-y-1.5">
        <div className="relative">
          <textarea
            ref={taRef}
            data-line-id={line.id}
            data-line-idx={line.idx}
            data-approved={line.approved ? "true" : "false"}
            className={`w-full rounded-md border px-2.5 py-1.5 text-sm leading-relaxed font-sans resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 ${
              dirty
                ? "border-amber-400 bg-amber-50/40"
                : "border-stone-200 bg-white"
            }`}
            rows={1}
            value={draft}
            placeholder={line.translation === null ? "(untranslated)" : ""}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={onKeyDown}
            disabled={busy}
          />
          {busy && (
            <Loader2 className="absolute top-2 right-2 h-3.5 w-3.5 animate-spin text-stone-400" />
          )}
          {!busy && savedTick > 0 && !dirty && (
            <span
              key={savedTick}
              className="absolute top-2 right-2 text-emerald-600 animate-[fadeOut_1.5s_ease-out_forwards]"
              aria-hidden
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={toggleApprove}
            disabled={busy || line.translation === null}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              line.approved
                ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
            }`}
            title={line.approved ? "Approved — click to unapprove" : "Approve"}
          >
            {line.approved ? (
              <CheckCheck className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {line.approved ? "Approved" : "Approve"}
          </button>
          <IconAction
            onClick={undo}
            disabled={busy || line.previous_translation === null}
            title="Undo last change (swap with previous)"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            label="Undo"
          />
          <IconAction
            onClick={() => setShowHint((s) => !s)}
            disabled={busy || line.translation === null}
            title="Re-translate with optional hint"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Re-translate"
          />
          {error && (
            <span className="text-xs text-red-700 ml-auto">{error}</span>
          )}
        </div>
        {showHint && (
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              placeholder="Optional hint (e.g. 'too literal — more casual')"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void retranslate();
                if (e.key === "Escape") {
                  setShowHint(false);
                  setHint("");
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={retranslate}
              disabled={busy}
              icon={
                busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )
              }
            >
              Run
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowHint(false);
                setHint("");
              }}
              icon={<X className="h-3.5 w-3.5" />}
              aria-label="Cancel hint"
            >
              {""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconAction({
  onClick,
  disabled,
  title,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

function BulkReplace({
  episodeId,
  onApplied,
}: {
  episodeId: string | null;
  onApplied: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!episodeId) return null;

  const apply = async () => {
    if (!find) return;
    if (
      !confirm(
        `Replace all occurrences of "${find}" with "${replace}"? Each modified line will be marked unapproved.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.bulkReplace(episodeId, find, replace, {
        case_sensitive: caseSensitive,
        whole_word: wholeWord,
      });
      setResult(`Modified ${r.modified} line${r.modified === 1 ? "" : "s"}.`);
      onApplied();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap text-sm">
      <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
        Bulk replace
      </span>
      <input
        className="rounded-md border border-stone-300 px-2 py-1 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
        placeholder="find"
        value={find}
        onChange={(e) => setFind(e.target.value)}
      />
      <span className="text-stone-400">→</span>
      <input
        className="rounded-md border border-stone-300 px-2 py-1 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
        placeholder="replace"
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
      />
      <label className="flex items-center gap-1 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
        />
        Case
      </label>
      <label className="flex items-center gap-1 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(e) => setWholeWord(e.target.checked)}
        />
        Whole word
      </label>
      <Button
        variant="primary"
        size="sm"
        onClick={apply}
        disabled={!find || busy}
        icon={
          busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : undefined
        }
      >
        Apply
      </Button>
      {result && (
        <span className="text-xs text-stone-600 inline-flex items-center gap-1">
          <CircleSlash className="h-3 w-3 text-stone-400" />
          {result}
        </span>
      )}
    </div>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="rounded-lg bg-white shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold inline-flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-stone-500" />
            Keyboard shortcuts
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            <ShortcutRow keys="j" desc="Jump to next unapproved line" />
            <ShortcutRow keys="?" desc="Toggle this help" />
            <ShortcutRow keys="Esc" desc="Close help / revert textarea draft" />
            <ShortcutRow
              keys="⌘ / Ctrl + Enter"
              desc="Save + approve + advance (inside textarea)"
            />
            <ShortcutRow keys="Tab" desc="Move between textareas" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <tr>
      <td className="py-2 pr-3 align-top">
        <kbd className="font-mono text-xs bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5 whitespace-nowrap">
          {keys}
        </kbd>
      </td>
      <td className="py-2 text-stone-700">{desc}</td>
    </tr>
  );
}

function formatTs(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
