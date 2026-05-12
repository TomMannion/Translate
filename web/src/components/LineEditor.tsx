import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  const [showHelp, setShowHelp] = useState(false);

  const jumpToNextUnapproved = useCallback(
    (fromIdx?: number) => {
      const active = document.activeElement as HTMLElement | null;
      let cursorIdx = fromIdx ?? -1;
      if (fromIdx === undefined && active?.dataset?.lineIdx) {
        cursorIdx = Number(active.dataset.lineIdx);
      }
      const next = lines.find(
        (l) =>
          l.translation !== null && !l.approved && l.idx > cursorIdx,
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

  // Global shortcuts when NOT inside an editable field.
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
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wide">
          Lines
        </h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-stone-300 px-2 py-1 text-sm"
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as typeof filter)
            }
          >
            <option value="all">All ({lines.length})</option>
            <option value="unapproved">
              Unapproved (
              {lines.filter((l) => l.translation !== null && !l.approved).length}
              )
            </option>
            <option value="untranslated">
              Untranslated ({lines.filter((l) => l.translation === null).length}
              )
            </option>
          </select>
          <button
            onClick={() => jumpToNextUnapproved()}
            className="rounded border border-stone-300 px-2 py-1 text-sm"
            title="Jump to next unapproved line (j)"
          >
            Next unapproved (j)
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="rounded border border-stone-300 px-2 py-1 text-sm"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </div>

      <BulkReplace
        episodeId={lines[0]?.episode_id ?? null}
        onApplied={onBulkChanged}
      />

      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}

      <div
        ref={containerRef}
        className="rounded border border-stone-200 bg-white divide-y divide-stone-100"
      >
        {visible.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            onChanged={onLineChanged}
          />
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-4 text-sm text-stone-500">No matching lines.</p>
        )}
      </div>
    </section>
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
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep draft in sync when the server-side line changes (e.g. retranslate,
  // bulk-replace, or another action elsewhere).
  useEffect(() => {
    setDraft(line.translation ?? "");
  }, [line.translation]);

  // Auto-resize the textarea to its content.
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
      // Save (if dirty) → approve → advance to next unapproved.
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
        // Advance.
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
      className={`px-3 py-2 grid grid-cols-12 gap-3 items-start ${
        line.approved ? "bg-emerald-50/40" : ""
      }`}
    >
      <div className="col-span-2 text-xs font-mono text-stone-500">
        <div>#{line.idx}</div>
        <div>{formatTs(line.start_ms)}</div>
        {line.last_change_source && (
          <div className="text-[10px] uppercase mt-1 text-stone-400">
            {line.last_change_source.replace("_", " ")}
          </div>
        )}
      </div>
      <div className="col-span-4 text-sm whitespace-pre-wrap">
        {line.source_text}
      </div>
      <div className="col-span-6 space-y-1">
        <textarea
          ref={taRef}
          data-line-id={line.id}
          data-line-idx={line.idx}
          data-approved={line.approved ? "true" : "false"}
          className={`w-full rounded border px-2 py-1 text-sm font-sans resize-none ${
            dirty
              ? "border-amber-400 bg-amber-50"
              : "border-stone-300 bg-white"
          }`}
          rows={1}
          value={draft}
          placeholder={line.translation === null ? "(untranslated)" : ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!line.approved}
              onChange={toggleApprove}
              disabled={busy || line.translation === null}
            />
            <span>Approve</span>
          </label>
          <button
            onClick={undo}
            disabled={busy || line.previous_translation === null}
            className="text-stone-600 hover:text-stone-900 disabled:opacity-30"
            title="Undo last change (swap with previous translation)"
          >
            Undo
          </button>
          <button
            onClick={() => setShowHint((s) => !s)}
            disabled={busy || line.translation === null}
            className="text-stone-600 hover:text-stone-900 disabled:opacity-30"
          >
            Re-translate…
          </button>
          {busy && <span className="text-stone-400">working…</span>}
          {error && <span className="text-red-700">{error}</span>}
        </div>
        {showHint && (
          <div className="mt-1 flex items-center gap-2">
            <input
              className="flex-1 rounded border border-stone-300 px-2 py-1 text-xs"
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
            <button
              onClick={retranslate}
              disabled={busy}
              className="rounded bg-indigo-700 text-white px-2 py-1 text-xs disabled:opacity-50"
            >
              Run
            </button>
          </div>
        )}
      </div>
    </div>
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
    <div className="mb-3 rounded border border-stone-200 bg-stone-50 px-3 py-2 flex items-center gap-2 flex-wrap text-sm">
      <span className="font-medium text-stone-600">Bulk replace:</span>
      <input
        className="rounded border border-stone-300 px-2 py-1 text-sm w-40"
        placeholder="find"
        value={find}
        onChange={(e) => setFind(e.target.value)}
      />
      <span className="text-stone-400">→</span>
      <input
        className="rounded border border-stone-300 px-2 py-1 text-sm w-40"
        placeholder="replace"
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
        />
        Case
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={wholeWord}
          onChange={(e) => setWholeWord(e.target.checked)}
        />
        Whole word
      </label>
      <button
        onClick={apply}
        disabled={!find || busy}
        className="rounded bg-stone-900 text-white px-3 py-1 text-sm disabled:opacity-50"
      >
        Apply
      </button>
      {result && <span className="text-xs text-stone-600">{result}</span>}
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
        className="rounded-lg bg-white shadow-xl max-w-md w-full p-6 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">Keyboard shortcuts</h3>
        <table className="w-full text-sm">
          <tbody>
            <Row keys="j" desc="Jump to next unapproved line" />
            <Row keys="?" desc="Toggle this help" />
            <Row keys="Esc" desc="Close help / revert textarea draft" />
            <Row
              keys="⌘/Ctrl + Enter"
              desc="Save + approve + advance (in textarea)"
            />
            <Row keys="Tab" desc="Move between textareas (native)" />
          </tbody>
        </table>
        <button
          onClick={onClose}
          className="rounded bg-stone-900 text-white px-3 py-1.5 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Row({ keys, desc }: { keys: string; desc: string }) {
  return (
    <tr className="border-t border-stone-100">
      <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">{keys}</td>
      <td className="py-1 text-stone-700">{desc}</td>
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
