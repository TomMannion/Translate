// Wrap a single-line English translation to at most `maxLineLen` characters
// across at most `maxLines` rows by breaking on whitespace. Falls back to a
// hard mid-word break only when no whitespace fits. Returns the joined string
// with "\n" between rows.
//
// The Gemini translation step emits one continuous string per idx (see plan
// §12). This is the host-side wrapper.
export function wrapSubtitle(
  text: string,
  maxLineLen = 42,
  maxLines = 2,
): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  if (collapsed.length <= maxLineLen) return collapsed;

  const rows: string[] = [];
  let remaining = collapsed;
  while (remaining.length > 0 && rows.length < maxLines) {
    if (remaining.length <= maxLineLen) {
      rows.push(remaining);
      remaining = "";
      break;
    }
    // Find last space at or before maxLineLen.
    let cut = remaining.lastIndexOf(" ", maxLineLen);
    if (cut <= 0) cut = maxLineLen; // hard break — no space found
    rows.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  // If anything is still left and we've hit maxLines, force-append to the last
  // row (better to overflow than to silently drop content).
  if (remaining.length > 0) {
    rows[rows.length - 1] = (rows[rows.length - 1] ?? "") + " " + remaining;
  }
  return rows.join("\n");
}
