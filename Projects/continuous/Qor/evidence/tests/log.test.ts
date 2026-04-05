import { describe, it, expect, beforeEach } from "vitest";
import { appendEvidence, readEvidence, getChainLength } from "../log";
import { unlinkSync, existsSync } from "node:fs";

const LEDGER = "/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl";

beforeEach(() => {
  if (existsSync(LEDGER)) unlinkSync(LEDGER);
});

describe("appendEvidence", () => {
  it("creates file if absent and returns entry with id+timestamp", () => {
    const entry = appendEvidence({
      kind: "PolicyDecision",
      source: "test",
      module: "victor",
      payload: { decision: "Allow" },
      confidence: 0.9,
    });
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(existsSync(LEDGER)).toBe(true);
  });

  it("appends to existing file", () => {
    appendEvidence({ kind: "TestResult", source: "a", module: "forge", payload: {}, confidence: 1 });
    appendEvidence({ kind: "CodeDelta", source: "b", module: "forge", payload: {}, confidence: 0.8 });
    expect(getChainLength()).toBe(2);
  });
});

describe("readEvidence", () => {
  it("returns empty array when no file", () => {
    expect(readEvidence()).toEqual([]);
  });

  it("filters by kind", () => {
    appendEvidence({ kind: "TestResult", source: "a", module: "victor", payload: {}, confidence: 1 });
    appendEvidence({ kind: "PolicyDecision", source: "b", module: "victor", payload: {}, confidence: 0.9 });
    const filtered = readEvidence({ kind: "TestResult" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("TestResult");
  });

  it("filters by module", () => {
    appendEvidence({ kind: "TestResult", source: "a", module: "victor", payload: {}, confidence: 1 });
    appendEvidence({ kind: "TestResult", source: "b", module: "forge", payload: {}, confidence: 1 });
    expect(readEvidence({ module: "forge" })).toHaveLength(1);
  });

  it("filters by since", () => {
    appendEvidence({ kind: "TestResult", source: "a", module: "victor", payload: {}, confidence: 1 });
    const future = readEvidence({ since: "2099-01-01T00:00:00Z" });
    expect(future).toHaveLength(0);
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      appendEvidence({ kind: "TestResult", source: `s${i}`, module: "victor", payload: {}, confidence: 1 });
    }
    expect(readEvidence({ limit: 3 })).toHaveLength(3);
  });
});

describe("getChainLength", () => {
  it("returns 0 when no file", () => {
    expect(getChainLength()).toBe(0);
  });

  it("returns correct count", () => {
    appendEvidence({ kind: "TestResult", source: "a", module: "victor", payload: {}, confidence: 1 });
    appendEvidence({ kind: "TestResult", source: "b", module: "victor", payload: {}, confidence: 1 });
    expect(getChainLength()).toBe(2);
  });
});
