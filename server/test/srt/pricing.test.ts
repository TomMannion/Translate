import { describe, expect, it } from "vitest";
import { ratesFor } from "../../src/llm/pricing.ts";

const TABLE = {
  default: {
    input_per_mtok: 0.5,
    output_per_mtok: 5,
    thinking_per_mtok: 5,
  },
  models: {
    "gemini-2.5-pro": {
      input_per_mtok: 1.25,
      output_per_mtok: 10,
      thinking_per_mtok: 10,
    },
    "gemini-2.5-flash": {
      input_per_mtok: 0.3,
      output_per_mtok: 2.5,
      thinking_per_mtok: 2.5,
    },
  },
};

describe("ratesFor", () => {
  it("exact match wins", () => {
    expect(ratesFor("gemini-2.5-pro", TABLE).input_per_mtok).toBe(1.25);
  });

  it("longest prefix match wins for versioned ids", () => {
    expect(ratesFor("gemini-2.5-pro-001", TABLE).input_per_mtok).toBe(1.25);
    expect(ratesFor("gemini-2.5-flash-preview", TABLE).input_per_mtok).toBe(
      0.3,
    );
  });

  it("falls back to default for unknown models", () => {
    expect(ratesFor("gemini-9-superduper", TABLE).input_per_mtok).toBe(0.5);
  });
});
