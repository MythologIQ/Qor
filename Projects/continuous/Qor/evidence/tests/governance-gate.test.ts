import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyEvidence, validateLite, validateFull, executeGovernedAction } from "../governance-gate";
import type { GovernedActionInput, GovernedEvidenceLite, EvidenceBundle } from "../contract";

vi.mock("../log", () => ({
  appendEvidence: vi.fn(),
}));

const LITE_EVIDENCE: GovernedEvidenceLite = {
  intent: "Create a new build phase",
  justification: "Roadmap milestone requires packaging plane",
  inputs: ["phases.json", "roadmap spec"],
  expectedOutcome: "New phase appended to project",
};

function liteInput(overrides?: Partial<GovernedActionInput>): GovernedActionInput {
  return {
    module: "forge",
    action: "phase.create",
    agentId: "operator",
    payload: { name: "Test Phase" },
    evidence: LITE_EVIDENCE,
    ...overrides,
  };
}

function fullBundle(): EvidenceBundle {
  return {
    id: "bundle-1",
    sessionId: "sess-1",
    intentId: "intent-1",
    workCellIds: ["wc-1"],
    entries: [{
      id: "e1", timestamp: "2026-04-05T00:00:00Z", kind: "PolicyDecision",
      source: "test", module: "forge", payload: {}, confidence: 0.9,
    }],
    confidence: 0.9,
    completeness: { hasTests: true, hasReview: false, hasPolicyDecisions: true, hasCodeDeltas: false, missing: [] },
    generatedAt: "2026-04-05T00:00:00Z",
  };
}

describe("classifyEvidence", () => {
  it("returns 'full' for valid EvidenceBundle shape", () => {
    expect(classifyEvidence(fullBundle())).toBe("full");
  });

  it("returns 'lite' for valid GovernedEvidenceLite shape", () => {
    expect(classifyEvidence(LITE_EVIDENCE)).toBe("lite");
  });

  it("returns 'invalid' for null", () => {
    expect(classifyEvidence(null)).toBe("invalid");
  });

  it("returns 'invalid' for empty object", () => {
    expect(classifyEvidence({})).toBe("invalid");
  });

  it("returns 'invalid' for partial object", () => {
    expect(classifyEvidence({ intent: "x" })).toBe("invalid");
  });
});

describe("validateLite", () => {
  it("rejects empty intent", () => {
    expect(validateLite({ ...LITE_EVIDENCE, intent: "" })).toBe(false);
  });

  it("rejects empty inputs array", () => {
    expect(validateLite({ ...LITE_EVIDENCE, inputs: [] })).toBe(false);
  });

  it("rejects missing expectedOutcome", () => {
    expect(validateLite({ ...LITE_EVIDENCE, expectedOutcome: "" })).toBe(false);
  });

  it("accepts valid lite evidence", () => {
    expect(validateLite(LITE_EVIDENCE)).toBe(true);
  });
});

describe("validateFull", () => {
  it("rejects missing entries", () => {
    const b = fullBundle();
    b.entries = [];
    expect(validateFull(b)).toBe(false);
  });

  it("rejects missing sessionId", () => {
    const b = fullBundle();
    b.sessionId = "";
    expect(validateFull(b)).toBe(false);
  });

  it("accepts valid full bundle", () => {
    expect(validateFull(fullBundle())).toBe(true);
  });
});

describe("executeGovernedAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("blocks when no evidence provided", async () => {
    const { decision, allowed } = await executeGovernedAction(
      liteInput({ evidence: undefined as any })
    );
    expect(allowed).toBe(false);
    expect(decision.result).toBe("Block");
  });

  it("blocks when evidence fails validation", async () => {
    const { decision, allowed } = await executeGovernedAction(
      liteInput({ evidence: { intent: "", justification: "x", inputs: ["a"], expectedOutcome: "y" } })
    );
    expect(allowed).toBe(false);
    expect(decision.result).toBe("Block");
  });

  it("allows low-risk action with valid lite evidence", async () => {
    const { decision, allowed } = await executeGovernedAction(liteInput());
    expect(allowed).toBe(true);
    expect(decision.result).toBe("Allow");
    expect(decision.evidenceMode).toBe("lite");
  });

  it("allows low-risk action with valid full bundle", async () => {
    const { decision, allowed } = await executeGovernedAction(
      liteInput({ evidence: fullBundle() })
    );
    expect(allowed).toBe(true);
    expect(decision.result).toBe("Allow");
    expect(decision.evidenceMode).toBe("full");
  });

  it("blocks high-risk action even with valid evidence", async () => {
    const { decision, allowed } = await executeGovernedAction(
      liteInput({ action: "auth.modify" })
    );
    expect(allowed).toBe(false);
    expect(decision.result).not.toBe("Allow");
  });

  it("records decision to evidence ledger regardless of outcome", async () => {
    const { appendEvidence } = await import("../log");
    await executeGovernedAction(liteInput());
    expect(appendEvidence).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    await executeGovernedAction(liteInput({ evidence: undefined as any }));
    expect(appendEvidence).toHaveBeenCalledTimes(1);
  });

  it("returns lower confidence for lite evidence than full", async () => {
    const lite = await executeGovernedAction(liteInput());
    const full = await executeGovernedAction(liteInput({ evidence: fullBundle() }));
    expect(lite.decision.confidence).toBeLessThan(full.decision.confidence);
  });

  it("returns decisionId that can be referenced by downstream writes", async () => {
    const { decision } = await executeGovernedAction(liteInput());
    expect(decision.decisionId).toMatch(/^gov_/);
    expect(decision.decisionId.length).toBeGreaterThan(4);
  });
});
