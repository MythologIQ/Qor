import { describe, it, expect, beforeEach } from "bun:test";
import { appendEvidence, readEvidence } from "../log";
import { existsSync, unlinkSync } from "node:fs";

const LEDGER = "/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl";

function clearLedger() {
  if (existsSync(LEDGER)) unlinkSync(LEDGER);
}

const VALID_KINDS = ["CapabilityReceipt", "PolicyDecision", "TestResult", "CodeDelta", "ReviewRecord", "ReleaseRecord", "MemoryRecall"];
const VALID_MODULES = ["victor", "qora", "forge", "continuum", "qor"];

describe("ingestion contract - schema validation", () => {
  beforeEach(clearLedger);

  it("accepts valid evidence entry with ingestionClass primitive", () => {
    const entry = appendEvidence({
      kind: "TestResult",
      source: "test-runner",
      module: "forge",
      payload: { passed: 5 },
      confidence: 0.9,
      ingestionClass: "primitive",
      sourceRoute: "/api/qor/evidence",
      actor: "test-agent",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
    const stored = readEvidence();
    const last = stored[stored.length - 1] as Record<string, unknown>;
    expect(last.ingestionClass).toBe("primitive");
    expect(last.sourceRoute).toBe("/api/qor/evidence");
    expect(last.actor).toBe("test-agent");
  });

  it("accepts valid evidence entry with ingestionClass decision", () => {
    const entry = appendEvidence({
      kind: "PolicyDecision",
      source: "governance-gate/forge",
      module: "forge",
      payload: { result: "Allow", action: "task.update" },
      confidence: 0.7,
      ingestionClass: "decision",
    });
    expect(entry.id).toBeTruthy();
    const stored = readEvidence();
    const last = stored[stored.length - 1] as Record<string, unknown>;
    expect(last.ingestionClass).toBe("decision");
  });

  it("preserves all valid EvidenceKind values", () => {
    for (const kind of VALID_KINDS) {
      appendEvidence({
        kind: kind as any,
        source: "test",
        module: "qor",
        payload: {},
        confidence: 0.5,
      });
    }
    const entries = readEvidence();
    expect(entries.length).toBe(VALID_KINDS.length);
    const kinds = entries.map(e => e.kind);
    for (const k of VALID_KINDS) {
      expect(kinds).toContain(k);
    }
  });

  it("preserves all valid module values", () => {
    for (const mod of VALID_MODULES) {
      appendEvidence({
        kind: "TestResult",
        source: "test",
        module: mod as any,
        payload: {},
        confidence: 0.5,
      });
    }
    const entries = readEvidence();
    expect(entries.length).toBe(VALID_MODULES.length);
    const modules = entries.map(e => e.module);
    for (const m of VALID_MODULES) {
      expect(modules).toContain(m);
    }
  });
});

describe("ingestion contract - append-only", () => {
  beforeEach(clearLedger);

  it("entries accumulate, never overwrite", () => {
    appendEvidence({ kind: "TestResult", source: "a", module: "forge", payload: {}, confidence: 0.5 });
    appendEvidence({ kind: "TestResult", source: "b", module: "forge", payload: {}, confidence: 0.5 });
    appendEvidence({ kind: "TestResult", source: "c", module: "forge", payload: {}, confidence: 0.5 });
    const entries = readEvidence();
    expect(entries.length).toBe(3);
    expect(entries[0].source).toBe("a");
    expect(entries[1].source).toBe("b");
    expect(entries[2].source).toBe("c");
  });

  it("each entry gets unique id and timestamp", () => {
    appendEvidence({ kind: "TestResult", source: "x", module: "forge", payload: {}, confidence: 0.5 });
    appendEvidence({ kind: "TestResult", source: "y", module: "forge", payload: {}, confidence: 0.5 });
    const entries = readEvidence();
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(entries[0].timestamp).toBeTruthy();
    expect(entries[1].timestamp).toBeTruthy();
  });
});

describe("ingestion contract - source tagging", () => {
  beforeEach(clearLedger);

  it("tags primitive intake records with source metadata", () => {
    appendEvidence({
      kind: "CapabilityReceipt",
      source: "external-tool",
      module: "victor",
      payload: { tool: "test" },
      confidence: 0.8,
      ingestionClass: "primitive",
      sourceRoute: "/api/qor/evidence",
      actor: "operator",
    });
    const entries = readEvidence();
    const last = entries[entries.length - 1] as Record<string, unknown>;
    expect(last.ingestionClass).toBe("primitive");
    expect(last.sourceRoute).toBe("/api/qor/evidence");
    expect(last.actor).toBe("operator");
  });

  it("tags decision records from governance gate", () => {
    appendEvidence({
      kind: "PolicyDecision",
      source: "governance-gate/qora",
      module: "qora",
      payload: { decisionId: "gov_123", result: "Allow" },
      confidence: 0.63,
      ingestionClass: "decision",
      sourceRoute: "/api/qora/record-veto",
    });
    const entries = readEvidence();
    const last = entries[entries.length - 1] as Record<string, unknown>;
    expect(last.ingestionClass).toBe("decision");
    expect(last.sourceRoute).toBe("/api/qora/record-veto");
  });
});
