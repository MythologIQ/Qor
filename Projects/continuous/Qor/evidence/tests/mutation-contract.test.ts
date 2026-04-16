import { describe, it, expect } from "vitest";
import {
  validateMutationContract,
  validateMutationContractShape,
  validateMutationContractSemantics,
} from "../mutation-contract";
import type { MutationContract } from "../mutation-contract";
import { randomUUID } from "node:crypto";

function validContract(overrides?: Partial<MutationContract>): MutationContract {
  return {
    mutationId: "mut-001",
    actor: {
      id: "victor",
      kind: "agent",
      displayName: "Victor",
    },
    target: {
      kind: "graph-node",
      identifier: "memory://agents/builder",
      version: "v1",
    },
    scope: {
      domain: "memory",
      targetPath: "continuum://knowledge/agents/builder",
    },
    operation: {
      type: "update",
      payload: { classification: "builder" },
    },
    justification: {
      hypothesis: "reclassification improves retrieval precision",
    },
    constraints: {
      mustNot: {
        violatePolicy: true,
        breakSchema: true,
      },
    },
    validation: {
      objective: "Improve retrieval precision without increasing latency",
      validators: ["atomic-contract-shape", "behavioral-objective-metrics"],
      metrics: [
        { metric: "retrieval_precision", operator: ">=", threshold: 0.92 },
        { metric: "latency_delta", operator: "<=", threshold: 0.05 },
      ],
    },
    lifecycle: {
      status: "proposed",
      proposedAt: "2026-04-13T00:00:00Z",
    },
    status: "proposed",
    ...overrides,
  };
}

describe("validateMutationContractShape", () => {
  it("accepts a complete mutation contract shape", () => {
    const result = validateMutationContractShape(validContract());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-object contracts", () => {
    const result = validateMutationContractShape(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("contract must be an object");
  });

  it("rejects missing required top-level fields", () => {
    const result = validateMutationContractShape({
      mutationId: "",
      actor: { id: "", kind: undefined },
      target: { kind: undefined, identifier: "" },
      scope: { domain: "memory", targetPath: "" },
      operation: { type: "update", payload: {} },
      justification: { hypothesis: "" },
      validation: { objective: "", validators: [], metrics: [] },
      lifecycle: { status: "proposed", proposedAt: "" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("mutationId is required");
    expect(result.errors).toContain("actor.id is required");
    expect(result.errors).toContain("target.identifier is required");
    expect(result.errors).toContain("scope.targetPath is required");
    expect(result.errors).toContain("justification.hypothesis is required");
    expect(result.errors).toContain("validation.objective is required");
    expect(result.errors).toContain("validation.validators must contain at least one validator");
    expect(result.errors).toContain("validation.metrics must contain at least one metric");
    expect(result.errors).toContain("lifecycle.proposedAt is required");
    expect(result.errors).toContain("status is required");
  });

  it("rejects non-object operation payloads", () => {
    const result = validateMutationContractShape(validContract({
      operation: { type: "update", payload: [] as unknown as Record<string, unknown> },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("operation.payload must be an object");
  });
});

describe("validateMutationContractSemantics", () => {
  it("accepts valid semantics for a memory mutation", () => {
    const result = validateMutationContractSemantics(validContract());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects target paths with invalid prefixes for a domain", () => {
    const result = validateMutationContractSemantics(validContract({
      scope: { domain: "memory", targetPath: "policy://private-memory" },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("scope.targetPath must start with an allowed prefix for domain 'memory'");
  });

  it("rejects unsupported operation types", () => {
    const contract = validContract();
    (contract.operation as { type: string }).type = "destroy";
    const result = validateMutationContractSemantics(contract);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("unsupported operation.type 'destroy'");
  });

  it("rejects unsupported metric operators", () => {
    const contract = validContract();
    (contract.validation.metrics[0] as { operator: string }).operator = "contains";
    const result = validateMutationContractSemantics(contract);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("unsupported metric operator 'contains'");
  });

  it("rejects status/lifecycle mismatches", () => {
    const result = validateMutationContractSemantics(validContract({
      status: "approved",
      lifecycle: {
        status: "proposed",
        proposedAt: "2026-04-13T00:00:00Z",
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("lifecycle.status must match status");
    expect(result.errors).toContain("lifecycle.approvedAt is required when status='approved'");
  });

  it("rejects duplicate validators", () => {
    const result = validateMutationContractSemantics(validContract({
      validation: {
        objective: "Measure outcome",
        validators: ["atomic-contract-shape", "atomic-contract-shape"],
        metrics: [{ metric: "retrieval_precision", operator: ">=", threshold: 0.92 }],
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("validation.validators must be unique");
  });

  it("keeps actor and mutation identity attributable", () => {
    const contract = validContract({
      mutationId: `mut-${randomUUID().slice(0, 8)}`,
      actor: { id: "forge", kind: "system", displayName: "Forge" },
    });
    const result = validateMutationContract(contract);
    expect(result.valid).toBe(true);
    expect(contract.actor.id).toBe("forge");
    expect(contract.mutationId.startsWith("mut-")).toBe(true);
  });

  it("rejects expandAccessBoundary constraint outside policy domain", () => {
    const result = validateMutationContractSemantics(validContract({
      constraints: { mustNot: { expandAccessBoundary: true } },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("expandAccessBoundary constraint is only valid for policy-domain mutations");
  });
});

describe("validateMutationContract", () => {
  it("passes a fully valid contract", () => {
    const result = validateMutationContract(validContract());
    expect(result.valid).toBe(true);
  });

  it("stops on shape failure before semantic validation", () => {
    const result = validateMutationContract({
      mutationId: "mut-001",
      actor: "victor",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("scope is required");
  });
});
