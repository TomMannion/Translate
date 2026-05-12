import { describe, expect, it } from "vitest";
import {
  buildChunk,
  chunkPlan,
  validateChunkOutput,
} from "../../src/llm/chunk.ts";

const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    idx: i + 1,
    source_text: `line ${i + 1}`,
  }));

describe("chunkPlan", () => {
  it("partitions evenly", () => {
    const p = chunkPlan(lines(100), 25);
    expect(p.totalChunks).toBe(4);
    expect(p.ranges[0]).toEqual({ start: 0, end: 25 });
    expect(p.ranges[3]).toEqual({ start: 75, end: 100 });
  });

  it("handles a final short chunk", () => {
    const p = chunkPlan(lines(103), 50);
    expect(p.totalChunks).toBe(3);
    expect(p.ranges[2]).toEqual({ start: 100, end: 103 });
  });

  it("rejects non-positive chunk size", () => {
    expect(() => chunkPlan(lines(10), 0)).toThrow();
  });
});

describe("buildChunk", () => {
  it("first chunk has no overlap", () => {
    const c = buildChunk(lines(100), 50, 5, 0, new Map());
    expect(c.index).toBe(0);
    expect(c.lines).toHaveLength(50);
    expect(c.overlap).toHaveLength(0);
  });

  it("second chunk has overlap from previous translations", () => {
    const prev = new Map<number, string>();
    for (let i = 1; i <= 50; i++) prev.set(i, `T${i}`);
    const c = buildChunk(lines(100), 50, 5, 1, prev);
    expect(c.overlap).toHaveLength(5);
    expect(c.overlap[0]).toEqual({
      idx: 46,
      source_text: "line 46",
      translation: "T46",
    });
    expect(c.lines[0]!.idx).toBe(51);
  });

  it("skips overlap entries that have no translation yet", () => {
    const prev = new Map<number, string>();
    prev.set(48, "T48"); // 49, 50 missing
    const c = buildChunk(lines(100), 50, 5, 1, prev);
    expect(c.overlap.map((o) => o.idx)).toEqual([48]);
  });
});

describe("validateChunkOutput", () => {
  const chunk = {
    index: 0,
    total: 1,
    lines: [
      { idx: 1, source_text: "a" },
      { idx: 2, source_text: "b" },
      { idx: 3, source_text: "c" },
    ],
    overlap: [],
  };

  it("accepts the happy path", () => {
    const r = validateChunkOutput(chunk, [
      { idx: 1, translation: "A" },
      { idx: 2, translation: "B" },
      { idx: 3, translation: "C" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("flags missing idx", () => {
    const r = validateChunkOutput(chunk, [
      { idx: 1, translation: "A" },
      { idx: 3, translation: "C" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([2]);
  });

  it("flags duplicate idx (the §1 failure mode)", () => {
    const r = validateChunkOutput(chunk, [
      { idx: 1, translation: "A" },
      { idx: 1, translation: "A!" },
      { idx: 2, translation: "B" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.duplicates).toEqual([1]);
    expect(r.missing).toEqual([3]);
  });

  it("flags extra idx not in the chunk", () => {
    const r = validateChunkOutput(chunk, [
      { idx: 1, translation: "A" },
      { idx: 2, translation: "B" },
      { idx: 3, translation: "C" },
      { idx: 99, translation: "?" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.extra).toEqual([99]);
  });
});
