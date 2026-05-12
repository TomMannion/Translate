import type { SrtEntry } from "./parse.ts";

// Canonical SRT output: LF line endings (callers can convert), comma as ms
// separator, blank line between entries, no trailing blank line on EOF.
export function writeSrt(entries: SrtEntry[]): string {
  return entries.map(formatEntry).join("\n\n") + "\n";
}

function formatEntry(e: SrtEntry): string {
  return `${e.idx}\n${formatTs(e.start_ms)} --> ${formatTs(e.end_ms)}\n${e.text}`;
}

export function formatTs(ms: number): string {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return (
    pad(h, 2) + ":" + pad(m, 2) + ":" + pad(s, 2) + "," + pad(millis, 3)
  );
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
