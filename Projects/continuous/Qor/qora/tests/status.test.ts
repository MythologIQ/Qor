import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import {
  readLedgerLines,
  parseLedger,
  countByType,
  latestEntry,
  verifyChain,
  timeRange,
  buildQoraStatus,
  PATHS,
  type LedgerEntry,
} from "../src/api/status";

const TEST_LEDGER = "/tmp/qora-test-ledger.jsonl";

function makeLedgerEntry(seq: number, type: string, prevHash: string): LedgerEntry {
  const hash = `hash_${seq}`;
  return {
    seq,
    timestamp: new Date(Date.now() - (10 - seq) * 60000).toISOString(),
    type,
    hash,
    prevHash,
    payload: { test: true },
    provenance: { source: "test", tier: 1, autonomyLevel: 1 },
  };
}

function writeTestLedger(entries: LedgerEntry[]) {
  writeFileSync(TEST_LEDGER, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
}

describe("readLedgerLines", () => {
  it("returns empty array for nonexistent file", () => {
    expect(readLedgerLines("/nonexistent/path.jsonl")).toEqual([]);
  });

  it("reads lines from file", () => {
    writeFileSync(TEST_LEDGER, "line1\nline2\nline3\n");
    const lines = readLedgerLines(TEST_LEDGER);
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  afterEach(() => {
    if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  });
});

describe("parseLedger", () => {
  afterEach(() => {
    if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  });

  it("returns empty array for missing file", () => {
    expect(parseLedger("/nonexistent.jsonl")).toEqual([]);
  });

  it("parses valid JSONL entries", () => {
    const entries = [
      makeLedgerEntry(1, "HEARTBEAT", "genesis"),
      makeLedgerEntry(2, "VETO", "hash_1"),
    ];
    writeTestLedger(entries);
    const parsed = parseLedger(TEST_LEDGER);
    expect(parsed.length).toBe(2);
    expect(parsed[0].type).toBe("HEARTBEAT");
    expect(parsed[1].type).toBe("VETO");
  });

  it("skips malformed lines", () => {
    writeFileSync(TEST_LEDGER, '{"seq":1,"type":"X","hash":"a","prevHash":"b","timestamp":"t","payload":{},"provenance":{"source":"s","tier":1,"autonomyLevel":1}}\nnot-json\n');
    const parsed = parseLedger(TEST_LEDGER);
    expect(parsed.length).toBe(1);
  });
});

describe("countByType", () => {
  it("returns empty object for no entries", () => {
    expect(countByType([])).toEqual({});
  });

  it("counts entries by type", () => {
    const entries = [
      makeLedgerEntry(1, "HEARTBEAT", "genesis"),
      makeLedgerEntry(2, "HEARTBEAT", "hash_1"),
      makeLedgerEntry(3, "VETO", "hash_2"),
      makeLedgerEntry(4, "AUDIT", "hash_3"),
    ];
    const counts = countByType(entries);
    expect(counts.HEARTBEAT).toBe(2);
    expect(counts.VETO).toBe(1);
    expect(counts.AUDIT).toBe(1);
  });
});

describe("latestEntry", () => {
  it("returns null for empty array", () => {
    expect(latestEntry([])).toBeNull();
  });

  it("returns last entry", () => {
    const entries = [
      makeLedgerEntry(1, "HEARTBEAT", "genesis"),
      makeLedgerEntry(2, "VETO", "hash_1"),
    ];
    expect(latestEntry(entries)?.seq).toBe(2);
  });
});

describe("verifyChain", () => {
  it("returns valid for empty chain", () => {
    expect(verifyChain([])).toEqual({ valid: true });
  });

  it("returns valid for single entry", () => {
    expect(verifyChain([makeLedgerEntry(1, "X", "genesis")])).toEqual({ valid: true });
  });

  it("returns valid for correct chain", () => {
    const entries = [
      makeLedgerEntry(1, "A", "genesis"),
      makeLedgerEntry(2, "B", "hash_1"),
      makeLedgerEntry(3, "C", "hash_2"),
    ];
    expect(verifyChain(entries)).toEqual({ valid: true });
  });

  it("detects broken chain", () => {
    const entries = [
      makeLedgerEntry(1, "A", "genesis"),
      makeLedgerEntry(2, "B", "wrong_hash"),
    ];
    expect(verifyChain(entries)).toEqual({ valid: false, brokenAt: 1 });
  });
});

describe("timeRange", () => {
  it("returns null for empty entries", () => {
    expect(timeRange([])).toBeNull();
  });

  it("returns from/to for entries", () => {
    const entries = [
      makeLedgerEntry(1, "A", "genesis"),
      makeLedgerEntry(2, "B", "hash_1"),
    ];
    const range = timeRange(entries);
    expect(range).not.toBeNull();
    expect(range!.from).toBe(entries[0].timestamp);
    expect(range!.to).toBe(entries[1].timestamp);
  });
});

describe("buildQoraStatus", () => {
  it("returns status object", () => {
    const status = buildQoraStatus();
    expect(status.entity).toBe("qora");
    expect(typeof status.entryCount).toBe("number");
    expect(typeof status.chainIntegrity).toBe("object");
    expect(status.chainIntegrity.valid).toBeDefined();
  });
});
