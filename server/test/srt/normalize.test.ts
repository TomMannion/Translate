import { describe, expect, it } from "vitest";
import { wrapSubtitle } from "../../src/srt/normalize.ts";

describe("wrapSubtitle", () => {
  it("returns short text unchanged", () => {
    expect(wrapSubtitle("Hello world")).toBe("Hello world");
  });

  it("collapses whitespace", () => {
    expect(wrapSubtitle("  too   many   spaces  ")).toBe("too many spaces");
  });

  it("wraps at the last space at or before maxLineLen", () => {
    const out = wrapSubtitle(
      "This is a fairly long subtitle line that needs wrapping",
      30,
      2,
    );
    const rows = out.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.length).toBeLessThanOrEqual(30);
  });

  it("hard-breaks when no whitespace fits", () => {
    const out = wrapSubtitle("supercalifragilisticexpialidocious", 10, 4);
    const rows = out.split("\n");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]!.length).toBe(10);
  });

  it("overflows the last line rather than dropping text", () => {
    const text = "one two three four five six seven eight nine ten eleven";
    const out = wrapSubtitle(text, 10, 2);
    const rejoined = out.replace(/\n/g, " ");
    for (const word of text.split(" ")) {
      expect(rejoined).toContain(word);
    }
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(wrapSubtitle("")).toBe("");
    expect(wrapSubtitle("   ")).toBe("");
  });
});
