// SRT parser. Tolerant of common real-world variants:
//   - UTF-8 BOM at file start
//   - CRLF / LF / CR line endings
//   - Missing trailing blank line
//   - Multi-line subtitle text
//   - Inline tags (<i>, <b>, <font ...>) and positioning tags ({\an8}) are preserved verbatim
//   - Comma OR period as millisecond separator on input (we normalise to comma on write)
//   - Idx not starting at 1 / non-contiguous (preserved as-is)
//   - Trailing whitespace inside text lines

export interface SrtEntry {
  idx: number;
  start_ms: number;
  end_ms: number;
  text: string; // raw text, newlines preserved as "\n" between rows
}

export class SrtParseError extends Error {
  constructor(message: string, public lineNumber?: number) {
    super(lineNumber == null ? message : `${message} (line ${lineNumber})`);
    this.name = "SrtParseError";
  }
}

const TS_RE =
  /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})/;

export function parseSrt(input: string): SrtEntry[] {
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  // Normalise line endings to \n. Order matters: handle CRLF first.
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = s.split("\n");
  const entries: SrtEntry[] = [];

  let i = 0;
  while (i < lines.length) {
    // Skip blank lines between entries.
    while (i < lines.length && lines[i]!.trim() === "") i++;
    if (i >= lines.length) break;

    const idxLineNum = i + 1;
    const idxLine = lines[i]!.trim();
    const idx = Number.parseInt(idxLine, 10);
    if (!Number.isFinite(idx)) {
      throw new SrtParseError(
        `Expected numeric subtitle index, got "${idxLine}"`,
        idxLineNum,
      );
    }
    i++;

    if (i >= lines.length) {
      throw new SrtParseError("Unexpected EOF after index", idxLineNum);
    }
    const tsLine = lines[i]!.trim();
    const m = TS_RE.exec(tsLine);
    if (!m) {
      throw new SrtParseError(
        `Expected timestamp line, got "${tsLine}"`,
        i + 1,
      );
    }
    const start_ms = toMs(m[1]!, m[2]!, m[3]!, m[4]!);
    const end_ms = toMs(m[5]!, m[6]!, m[7]!, m[8]!);
    i++;

    // Text rows run until next blank line or EOF.
    const textRows: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "") {
      textRows.push(lines[i]!);
      i++;
    }
    const text = textRows.join("\n").replace(/[ \t]+$/gm, ""); // trim trailing ws per row

    entries.push({ idx, start_ms, end_ms, text });
  }

  return entries;
}

function toMs(h: string, m: string, s: string, msStr: string): number {
  const hours = Number.parseInt(h, 10);
  const minutes = Number.parseInt(m, 10);
  const seconds = Number.parseInt(s, 10);
  // pad ms to 3 digits: "5" -> 500, "50" -> 500 (we treat as decimal fraction)
  const padded = (msStr + "000").slice(0, 3);
  const ms = Number.parseInt(padded, 10);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}
