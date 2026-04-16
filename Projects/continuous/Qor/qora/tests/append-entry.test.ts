import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { appendEntry, auth } from "../src/api/append-entry";
import { PATHS, parseLedger } from "../src/api/status";

const ORIGINAL_LEDGER = PATHS.ledgerPath;
const TEST_DIR = "/tmp/qora-test-data";
const TEST_LEDGER = `${TEST_DIR}/ledger.jsonl`;
const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/qora/.secrets/api_key";

describe("auth", () => {
  it("rejects empty token", () => {
    expect(auth("")).toBe(false);
  });

  it("accepts correct token", () => {
    const secret = readFileSync(SECRET_PATH, "utf-8").trim();
    expect(auth(secret)).toBe(true);
  });

  it("rejects wrong token", () => {
    expect(auth("wrong-token-12345")).toBe(false);
  });
});

describe("appendEntry", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    // Point PATHS to test location temporarily
    (PATHS as any).ledgerPath = TEST_LEDGER;
    if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  });

  afterEach(() => {
    (PATHS as any).ledgerPath = ORIGINAL_LEDGER;
    if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  });

  it("creates first entry with genesis prevHash", () => {
    const result = appendEntry("HEARTBEAT", { pulse: 1 }, { source: "test", tier: 1, autonomyLevel: 1 });
    expect(result.ok).toBe(true);
    expect(result.seq).toBe(1);
    const entries = parseLedger(TEST_LEDGER);
    expect(entries.length).toBe(1);
    expect(entries[0].prevHash).toBe("genesis");
  });

  it("chains entries with correct prevHash", () => {
    appendEntry("HEARTBEAT", {}, { source: "test", tier: 1, autonomyLevel: 1 });
    appendEntry("VETO", { target: "x" }, { source: "test", tier: 1, autonomyLevel: 1 });
    const entries = parseLedger(TEST_LEDGER);
    expect(entries.length).toBe(2);
    expect(entries[1].prevHash).toBe(entries[0].hash);
  });

  it("preserves payload and provenance", () => {
    const payload = { target: "build-1", reason: "test" };
    const prov = { source: "victor", tier: 2, autonomyLevel: 3 };
    appendEntry("VETO", payload, prov);
    const entries = parseLedger(TEST_LEDGER);
    expect(entries[0].payload).toEqual(payload);
    expect(entries[0].provenance).toEqual(prov);
  });

  it("increments seq correctly", () => {
    appendEntry("HEARTBEAT", {}, { source: "a", tier: 1, autonomyLevel: 1 });
    appendEntry("HEARTBEAT", {}, { source: "a", tier: 1, autonomyLevel: 1 });
    appendEntry("HEARTBEAT", {}, { source: "a", tier: 1, autonomyLevel: 1 });
    const entries = parseLedger(TEST_LEDGER);
    expect(entries.map(e => e.seq)).toEqual([1, 2, 3]);
  });
});
