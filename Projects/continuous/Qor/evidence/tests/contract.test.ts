import { describe, it, expect } from "vitest";
import type { EvidenceEntry, EvidenceKind, EvaluationRequest } from "../contract";

describe("EvidenceEntry schema", () => {
  it("accepts valid entry with all required fields", () => {
    const entry: EvidenceEntry = {
      id: "abc-123",
      timestamp: "2026-04-05T13:00:00Z",
      kind: "PolicyDecision",
      source: "victor-heartbeat",
      module: "victor",
      payload: { decision: "Allow" },
      confidence: 0.9,
    };
    expect(entry.id).toBe("abc-123");
    expect(entry.kind).toBe("PolicyDecision");
    expect(entry.module).toBe("victor");
  });

  it("accepts optional workCellId", () => {
    const entry: EvidenceEntry = {
      id: "def-456",
      timestamp: "2026-04-05T13:00:00Z",
      kind: "TestResult",
      workCellId: "cell-1",
      source: "test-runner",
      module: "forge",
      payload: { passed: 10, failed: 0 },
      confidence: 1.0,
    };
    expect(entry.workCellId).toBe("cell-1");
  });

  it("validates all EvidenceKind variants exist", () => {
    const kinds: EvidenceKind[] = [
      "CapabilityReceipt", "PolicyDecision", "TestResult",
      "CodeDelta", "ReviewRecord", "ReleaseRecord", "MemoryRecall",
    ];
    expect(kinds).toHaveLength(7);
  });
});

describe("EvaluationRequest schema", () => {
  it("requires action, agentId, trustStage", () => {
    const req: EvaluationRequest = {
      action: "file.read",
      agentId: "victor",
      trustStage: "cbt",
    };
    expect(req.action).toBe("file.read");
    expect(req.agentId).toBe("victor");
    expect(req.trustStage).toBe("cbt");
  });

  it("accepts optional resource and context", () => {
    const req: EvaluationRequest = {
      action: "file.write",
      agentId: "forge",
      resource: "src/main.ts",
      context: { phase: "implement" },
      trustStage: "kbt",
    };
    expect(req.resource).toBe("src/main.ts");
    expect(req.context).toEqual({ phase: "implement" });
  });
});
