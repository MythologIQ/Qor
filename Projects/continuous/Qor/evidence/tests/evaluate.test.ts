import { describe, it, expect } from "vitest";
import { evaluate, evaluateMutationContract, scoreAction } from "../evaluate";
import type { EvaluationRequest } from "../contract";
import type { MutationContract } from "../mutation-contract";

function req(action: string, resource?: string, trust: "cbt" | "kbt" | "ibt" = "cbt"): EvaluationRequest {
  return { action, agentId: "test", resource, trustStage: trust, context: resource ? { path: resource } : undefined };
}

function validContract(): MutationContract {
  return {
    mutationId: "mut-001",
    actor: { id: "victor", kind: "agent", displayName: "Victor" },
    target: { kind: "graph-node", identifier: "memory://agents/builder", version: "v1" },
    scope: { domain: "memory", targetPath: "continuum://knowledge/agents/builder" },
    operation: { type: "update", payload: { classification: "builder" } },
    justification: { hypothesis: "reclassification improves retrieval precision" },
    validation: {
      objective: "Increase retrieval precision while preserving latency",
      validators: ["atomic-contract-shape", "behavioral-objective-metrics"],
      metrics: [
        { metric: "retrieval_precision", operator: ">=", threshold: 0.92 },
        { metric: "latency_delta", operator: "<=", threshold: 0.05 },
      ],
    },
    lifecycle: { status: "proposed", proposedAt: "2026-04-13T00:00:00Z" },
    status: "proposed",
  };
}

describe("evaluate — FailSafe-Pro parity", () => {
  it("file.read at CBT → Allow", () => {
    const r = evaluate(req("file.read", "src/main.rs"));
    expect(r.decision).toBe("Allow");
    expect(r.riskScore).toBeLessThan(0.3);
  });

  it("shell.execute at CBT → Block", () => {
    const r = evaluate(req("shell.execute"));
    expect(r.decision).toBe("Block");
    expect(r.riskScore).toBeGreaterThanOrEqual(0.7);
  });

  it("file.write at CBT → Escalate", () => {
    const r = evaluate(req("file.write", "src/lib.rs"));
    expect(r.decision).toBe("Escalate");
  });

  it("file.write at IBT → Allow", () => {
    const r = evaluate(req("file.write", "src/lib.rs", "ibt"));
    expect(r.decision).toBe("Allow");
  });

  it(".env resource → credential boost", () => {
    const r = evaluate(req("file.read", ".env", "ibt"));
    expect(r.riskScore).toBeGreaterThanOrEqual(0.4);
    expect(r.riskCategory).toBe("medium");
  });

  it("/etc/passwd at CBT → Block", () => {
    const r = evaluate(req("file.write", "/etc/passwd"));
    expect(r.decision).toBe("Block");
    expect(r.riskScore).toBeGreaterThanOrEqual(0.6);
  });

  it("auth.modify at IBT → Block (always critical)", () => {
    const r = evaluate(req("auth.modify", undefined, "ibt"));
    expect(r.riskCategory).toBe("critical");
    expect(r.decision).toBe("Block");
  });

  it("confidence reflects available context", () => {
    const full = evaluate(req("file.read", "test.rs"));
    const minimal = evaluate({ action: "file.read", agentId: "test", trustStage: "cbt" });
    expect(full.confidence).toBeGreaterThan(minimal.confidence);
  });

  it("mitigation present on Block", () => {
    const r = evaluate(req("shell.execute"));
    expect(r.mitigation).toBeDefined();
  });

  it("mitigation absent on Allow", () => {
    const r = evaluate(req("file.read", "readme.md", "ibt"));
    expect(r.mitigation).toBeUndefined();
  });

  it("unknown action defaults to 0.5", () => {
    expect(scoreAction("unknown.action")).toBe(0.5);
  });
});

describe("evaluateMutationContract", () => {
  it("returns reproducible machine-readable validator results", () => {
    const first = evaluateMutationContract(validContract());
    const second = evaluateMutationContract(validContract());
    expect(first).toEqual(second);
    expect(first.reproducible).toBe(true);
    expect(first.validatorResults.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects when a critical validator fails", () => {
    const result = evaluateMutationContract({
      ...validContract(),
      target: { kind: "policy-rule", identifier: "policy://agents/builder" },
    });
    expect(result.decision).toBe("reject");
    expect(result.criticalFailures).toContain("structural-target-alignment");
  });

  it("surfaces mixed validator outcomes deterministically", () => {
    const result = evaluateMutationContract({
      ...validContract(),
      validation: {
        objective: "Measure one thing only",
        validators: ["atomic-contract-shape"],
        metrics: [{ metric: "retrieval_precision", operator: ">=", threshold: 0.92 }],
      },
    });
    expect(result.decision).toBe("reject");
    expect(result.criticalFailures).toEqual([]);
    expect(result.validatorResults.some((entry) =>
      entry.validatorId === "behavioral-objective-metrics" && entry.passed === false)).toBe(true);
  });

  it("requires committed mutations to preserve governance lifecycle evidence", () => {
    const result = evaluateMutationContract({
      ...validContract(),
      status: "committed",
      lifecycle: {
        status: "committed",
        proposedAt: "2026-04-13T00:00:00Z",
        committedAt: "2026-04-13T00:05:00Z",
      },
    });
    expect(result.decision).toBe("reject");
    expect(result.criticalFailures).toContain("governance-lifecycle-readiness");
  });
});
