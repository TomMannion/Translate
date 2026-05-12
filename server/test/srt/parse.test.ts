import { describe, expect, it } from "vitest";
import { parseSrt, SrtParseError } from "../../src/srt/parse.ts";
import { writeSrt } from "../../src/srt/write.ts";

const BASIC = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:05,250
Second line
`;

describe("parseSrt", () => {
  it("parses a simple two-entry file", () => {
    const out = parseSrt(BASIC);
    expect(out).toEqual([
      { idx: 1, start_ms: 1000, end_ms: 3500, text: "Hello world" },
      { idx: 2, start_ms: 4000, end_ms: 5250, text: "Second line" },
    ]);
  });

  it("strips UTF-8 BOM", () => {
    const out = parseSrt("﻿" + BASIC);
    expect(out[0]!.idx).toBe(1);
    expect(out[0]!.text).toBe("Hello world");
  });

  it("handles CRLF line endings", () => {
    const crlf = BASIC.replace(/\n/g, "\r\n");
    const out = parseSrt(crlf);
    expect(out).toHaveLength(2);
    expect(out[0]!.text).toBe("Hello world");
  });

  it("handles bare CR line endings", () => {
    const cr = BASIC.replace(/\n/g, "\r");
    const out = parseSrt(cr);
    expect(out).toHaveLength(2);
  });

  it("handles missing trailing blank line at EOF", () => {
    const noTrailing = BASIC.trimEnd();
    const out = parseSrt(noTrailing);
    expect(out).toHaveLength(2);
    expect(out[1]!.text).toBe("Second line");
  });

  it("preserves multi-line subtitle text", () => {
    const src = `1
00:00:01,000 --> 00:00:03,000
First row
Second row
Third row
`;
    const out = parseSrt(src);
    expect(out[0]!.text).toBe("First row\nSecond row\nThird row");
  });

  it("preserves inline italic / bold / font tags verbatim", () => {
    const src = `1
00:00:01,000 --> 00:00:03,000
<i>italic</i> and <b>bold</b> and <font color="red">red</font>
`;
    const out = parseSrt(src);
    expect(out[0]!.text).toBe(
      `<i>italic</i> and <b>bold</b> and <font color="red">red</font>`,
    );
  });

  it("preserves positioning tags verbatim", () => {
    const src = `1
00:00:01,000 --> 00:00:03,000
{\\an8}Top-centered text
`;
    const out = parseSrt(src);
    expect(out[0]!.text).toBe("{\\an8}Top-centered text");
  });

  it("accepts period as ms separator (some tools emit this)", () => {
    const src = `1
00:00:01.250 --> 00:00:03.750
Period separator
`;
    const out = parseSrt(src);
    expect(out[0]!.start_ms).toBe(1250);
    expect(out[0]!.end_ms).toBe(3750);
  });

  it("preserves non-contiguous idx values", () => {
    const src = `5
00:00:01,000 --> 00:00:02,000
Five

7
00:00:03,000 --> 00:00:04,000
Seven
`;
    const out = parseSrt(src);
    expect(out.map((e) => e.idx)).toEqual([5, 7]);
  });

  it("trims trailing whitespace inside text rows", () => {
    const src = `1
00:00:01,000 --> 00:00:02,000
trailing spaces
and tabs\t\t
`;
    const out = parseSrt(src);
    expect(out[0]!.text).toBe("trailing spaces\nand tabs");
  });

  it("handles multiple blank lines between entries", () => {
    const src = `1
00:00:01,000 --> 00:00:02,000
One



2
00:00:03,000 --> 00:00:04,000
Two
`;
    const out = parseSrt(src);
    expect(out).toHaveLength(2);
    expect(out[1]!.idx).toBe(2);
  });

  it("converts timestamps to ms across hours", () => {
    const src = `1
01:02:03,456 --> 01:02:04,000
Long
`;
    const out = parseSrt(src);
    expect(out[0]!.start_ms).toBe(
      ((1 * 60 + 2) * 60 + 3) * 1000 + 456,
    );
    expect(out[0]!.end_ms).toBe(((1 * 60 + 2) * 60 + 4) * 1000);
  });

  it("throws on a non-numeric index", () => {
    const src = `notanumber
00:00:01,000 --> 00:00:02,000
hi
`;
    expect(() => parseSrt(src)).toThrow(SrtParseError);
  });

  it("throws on a malformed timestamp", () => {
    const src = `1
00:00:01 - 00:00:02
hi
`;
    expect(() => parseSrt(src)).toThrow(SrtParseError);
  });

  it("returns [] on empty input", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("\n\n\n")).toEqual([]);
    expect(parseSrt("﻿\r\n")).toEqual([]);
  });
});

describe("writeSrt", () => {
  it("formats a basic entry with canonical timestamps and comma separator", () => {
    const out = writeSrt([
      { idx: 1, start_ms: 1000, end_ms: 3500, text: "Hello world" },
    ]);
    expect(out).toBe("1\n00:00:01,000 --> 00:00:03,500\nHello world\n");
  });

  it("pads millis to 3 digits", () => {
    const out = writeSrt([
      { idx: 1, start_ms: 50, end_ms: 60, text: "x" },
    ]);
    expect(out).toContain("00:00:00,050 --> 00:00:00,060");
  });

  it("clamps negative ms to zero", () => {
    const out = writeSrt([{ idx: 1, start_ms: -5, end_ms: 1000, text: "x" }]);
    expect(out).toContain("00:00:00,000 --> 00:00:01,000");
  });
});

describe("round trip", () => {
  const cases: { name: string; src: string }[] = [
    { name: "basic", src: BASIC },
    {
      name: "multi-line text",
      src: `1
00:00:01,000 --> 00:00:03,000
Row one
Row two

2
00:00:04,000 --> 00:00:05,000
Just one
`,
    },
    {
      name: "non-contiguous idx",
      src: `5
00:00:01,000 --> 00:00:02,000
Five

7
00:00:03,000 --> 00:00:04,000
Seven
`,
    },
    {
      name: "italic tags",
      src: `1
00:00:01,000 --> 00:00:02,000
<i>italic</i> text
`,
    },
  ];

  for (const c of cases) {
    it(`write(parse(x)) round-trips: ${c.name}`, () => {
      const parsed = parseSrt(c.src);
      const written = writeSrt(parsed);
      // Re-parse and compare semantic content.
      const reparsed = parseSrt(written);
      expect(reparsed).toEqual(parsed);
    });
  }

  it("normalises CRLF/BOM via round-trip (output is canonical LF)", () => {
    const crlf = "﻿" + BASIC.replace(/\n/g, "\r\n");
    const out = writeSrt(parseSrt(crlf));
    expect(out).not.toContain("\r");
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });
});
