import { describe, it, expect } from "vitest";
import { materialize, checkCompleteness } from "../bundle";
import type { EvidenceEntry, EvidencePolicy } from "../contract";

function entry(kind: EvidenceEntry["kind"], cellId?: string, confidence = 0.8): EvidenceEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    kind,
    workCellId: cellId,
    source: "test",
    module: "forge",
    payload: {},
    confidence,
  };
}

describe("materialize", () => {
  it("creates bundle with correct metadata", () => {
    const entries = [entry("TestResult", "c1"), entry("CodeDelta", "c1")];
    const bundle = materialize(entries, "sess-1", "intent-1", ["c1"]);
    expect(bundle.sessionId).toBe("sess-1");
    expect(bundle.intentId).toBe("intent-1");
    expect(bundle.entries).toHaveLength(2);
    expect(bundle.id).toBeDefined();
    expect(bundle.generatedAt).toBeDefined();
  });

  it("filters entries by workCellIds", () => {
    const entries = [entry("TestResult", "c1"), entry("CodeDelta", "c2")];
    const bundle = materialize(entries, "s", "i", ["c1"]);
    expect(bundle.entries).toHaveLength(1);
  });

  it("includes entries without workCellId", () => {
    const entries = [entry("PolicyDecision"), entry("TestResult", "c1")];
    const bundle = materialize(entries, "s", "i", ["c1"]);
    expect(bundle.entries).toHaveLength(2);
  });

  it("averages confidence from filtered entries", () => {
    const entries = [entry("TestResult", "c1", 0.6), entry("CodeDelta", "c1", 1.0)];
    const bundle = materialize(entries, "s", "i", ["c1"]);
    expect(bundle.confidence).toBeCloseTo(0.8);
  });

  it("returns 0 confidence for empty entries", () => {
    const bundle = materialize([], "s", "i", ["c1"]);
    expect(bundle.confidence).toBe(0);
  });
});

describe("checkCompleteness", () => {
  it("flags missing tests when policy requires them", () => {
    const entries = [entry("CodeDelta", "c1")];
    const bundle = materialize(entries, "s", "i", ["c1"]);
    const policy: EvidencePolicy = { requireTests: true, requireReview: false };
    const result = checkCompleteness(bundle, policy);
    expect(result.hasTests).toBe(false);
    expect(result.missing).toContain("tests");
  });

  it("flags missing review when policy requires it", () => {
    const entries = [entry("TestResult", "c1")];
    const bundle = materialize(entries, "s", "i", ["c1"]);
    const policy: EvidencePolicy = { requireTests: false, requireReview: true };
    const result = checkCompleteness(bundle, policy);
    expect(result.hasReview).toBe(false);
    expect(result.missing).toContain("review");
  });

  it("returns empty missing when all evidence present", () => {
    const entries = [
      entry("TestResult", "c1"),
      entry("ReviewRecord", "c1"),
      entry("PolicyDecision", "c1"),
      entry("CodeDelta", "c1"),
    ];
    const bundle = materialize(entries, "s", "i", ["c1"]);
    const policy: EvidencePolicy = { requireTests: true, requireReview: true };
    const result = checkCompleteness(bundle, policy);
    expect(result.missing).toHaveLength(0);
    expect(result.hasTests).toBe(true);
    expect(result.hasReview).toBe(true);
    expect(result.hasPolicyDecisions).toBe(true);
    expect(result.hasCodeDeltas).toBe(true);
  });
});
