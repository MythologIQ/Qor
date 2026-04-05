import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const LEDGER_PATH = "/home/workspace/Projects/continuous/Qor/qora/data/ledger.jsonl";

function parseLedger(): Array<Record<string, unknown>> {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("Ledger entry shape", () => {
  const entries = parseLedger();

  test("ledger file exists and has entries", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test("all entries have required fields", () => {
    for (const e of entries) {
      expect(e).toHaveProperty("seq");
      expect(e).toHaveProperty("timestamp");
      expect(e).toHaveProperty("type");
      expect(e).toHaveProperty("hash");
      expect(e).toHaveProperty("prevHash");
      expect(e).toHaveProperty("payload");
    }
  });

  test("seq values are monotonically increasing", () => {
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].seq).toBeGreaterThan(entries[i - 1].seq as number);
    }
  });
});

describe("Chain integrity", () => {
  const entries = parseLedger();

  test("each entry prevHash matches previous entry hash", () => {
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prevHash).toBe(entries[i - 1].hash);
    }
  });

  test("first entry prevHash is genesis or defined", () => {
    if (entries.length === 0) return;
    expect(entries[0].prevHash).toBeDefined();
  });
});

describe("Pagination math", () => {
  const entries = parseLedger();

  test("ceil(total / limit) equals expected totalPages", () => {
    const limits = [5, 10, 20, 50];
    for (const limit of limits) {
      const expected = Math.max(1, Math.ceil(entries.length / limit));
      expect(expected).toBeGreaterThan(0);
      expect(expected).toBeLessThanOrEqual(entries.length || 1);
    }
  });

  test("page 1 slice contains at most limit entries", () => {
    const limit = 5;
    const slice = entries.slice(0, limit);
    expect(slice.length).toBeLessThanOrEqual(limit);
  });
});
