/**
 * Tests for Cross-Model Verification
 *
 * Validates:
 * 1. Cross-model verification can strengthen or weaken crystallization candidates
 * 2. Verification outcomes map to explicit pinning or entropy events
 * 3. Unavailable verification degrades gracefully without forging confidence
 */

import { describe, test, expect } from "bun:test";
import {
  ModelId,
  VerificationOutcome,
  ModelVerificationResult,
  CrossModelVerification,
  CrossModelWeights,
  DEFAULT_CROSS_MODEL_WEIGHTS,
  VerificationSynthesis,
  verifyAcrossModels,
  synthesizeVerification,
  applyVerificationSynthesis,
  shouldBlockCrystallization,
  createMockVerifier,
  inspectVerificationWeights,
  checkVerificationAvailability,
  compareVerificationStrength,
} from "./cross-model-verification";
import { PinningEvent, PinningEventKind, applyPinningSequence } from "./weighted-pinning";
import { ConflictEvent, ConflictKind, applyConflictSequence } from "./entropy-injection";

// Helper to create a verification result
function createResult(
  modelId: ModelId,
  outcome: VerificationOutcome,
  confidence: number = 0.8
): ModelVerificationResult {
  return {
    modelId,
    outcome,
    confidence,
    timestamp: Date.now(),
  };
}

// Helper to create a complete verification
function createVerification(
  claimId: string,
  results: ModelVerificationResult[]
): CrossModelVerification {
  const unavailableModels = results
    .filter(r => r.outcome === VerificationOutcome.UNAVAILABLE)
    .map(r => r.modelId);

  return {
    claimId,
    verifiedAt: Date.now(),
    results,
    participatingModels: results
      .filter(r => r.outcome !== VerificationOutcome.UNAVAILABLE)
      .map(r => r.modelId),
    unavailableModels,
  };
}

describe("VerificationOutcome", () => {
  test("has four defined outcomes", () => {
    expect(VerificationOutcome.CONFIRM).toBe("confirm");
    expect(VerificationOutcome.CONTRADICT).toBe("contradict");
    expect(VerificationOutcome.ABSTAIN).toBe("abstain");
    expect(VerificationOutcome.UNAVAILABLE).toBe("unavailable");
  });
});

describe("DEFAULT_CROSS_MODEL_WEIGHTS", () => {
  test("has expected default values", () => {
    expect(DEFAULT_CROSS_MODEL_WEIGHTS.confirmWeight).toBe(0.20);
    expect(DEFAULT_CROSS_MODEL_WEIGHTS.contradictWeight).toBe(0.25);
    expect(DEFAULT_CROSS_MODEL_WEIGHTS.abstainWeight).toBe(0.02);
    expect(DEFAULT_CROSS_MODEL_WEIGHTS.minModelsForVerification).toBe(2);
    expect(DEFAULT_CROSS_MODEL_WEIGHTS.diversityFactor).toBe(0.85);
  });
});

describe("verifyAcrossModels", () => {
  test("collects results from all available models", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.CONFIRM,
      "model-b": VerificationOutcome.CONFIRM,
    };
    const mockVerifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "claim-1",
      "test content",
      ["model-a", "model-b"],
      mockVerifier
    );

    expect(verification.claimId).toBe("claim-1");
    expect(verification.results).toHaveLength(2);
    expect(verification.participatingModels).toHaveLength(2);
    expect(verification.unavailableModels).toHaveLength(0);
  });

  test("handles unavailable models gracefully", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.CONFIRM,
      "model-b": VerificationOutcome.UNAVAILABLE,
    };
    const mockVerifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "claim-1",
      "test content",
      ["model-a", "model-b"],
      mockVerifier
    );

    expect(verification.results).toHaveLength(2);
    expect(verification.participatingModels).toHaveLength(1);
    expect(verification.unavailableModels).toHaveLength(1);
    expect(verification.unavailableModels).toContain("model-b");
  });

  test("handles verifier errors gracefully", async () => {
    const failingVerifier = async () => {
      throw new Error("Model failed");
    };

    const verification = await verifyAcrossModels(
      "claim-1",
      "test content",
      ["model-a"],
      failingVerifier
    );

    expect(verification.results).toHaveLength(1);
    expect(verification.results[0].outcome).toBe(VerificationOutcome.UNAVAILABLE);
    expect(verification.results[0].reasoning).toContain("Verification failed");
  });
});

describe("synthesizeVerification", () => {
  test("strengthen verdict when confirmations outweigh contradictions", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM, 0.9),
      createResult("model-b", VerificationOutcome.CONFIRM, 0.8),
      createResult("model-c", VerificationOutcome.ABSTAIN, 0.5),
    ]);

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("strengthen");
    expect(synthesis.hasQuorum).toBe(true);
    expect(synthesis.confirmCount).toBe(2);
    expect(synthesis.contradictCount).toBe(0);
    expect(synthesis.pinningEvents.length).toBeGreaterThan(0);
    expect(synthesis.conflictEvents.length).toBe(0);
  });

  test("weaken verdict when contradictions outweigh confirmations", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM, 0.8),
      createResult("model-b", VerificationOutcome.CONTRADICT, 0.9),
      createResult("model-c", VerificationOutcome.CONTRADICT, 0.85),
    ]);

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("weaken");
    expect(synthesis.hasQuorum).toBe(true);
    expect(synthesis.confirmCount).toBe(1);
    expect(synthesis.contradictCount).toBe(2);
    expect(synthesis.pinningEvents.length).toBe(0);
    expect(synthesis.conflictEvents.length).toBeGreaterThan(0);
  });

  test("neutral verdict for mixed signals", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM, 0.8),
      createResult("model-b", VerificationOutcome.CONTRADICT, 0.8),
      createResult("model-c", VerificationOutcome.ABSTAIN, 0.5),
    ]);

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("neutral");
    expect(synthesis.hasQuorum).toBe(true);
  });

  test("inconclusive verdict when quorum not met", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM, 0.9),
      createResult("model-b", VerificationOutcome.UNAVAILABLE, 0),
    ]);

    const weights: CrossModelWeights = {
      ...DEFAULT_CROSS_MODEL_WEIGHTS,
      minModelsForVerification: 2,
    };

    const synthesis = synthesizeVerification(verification, weights);

    expect(synthesis.verdict).toBe("inconclusive");
    expect(synthesis.hasQuorum).toBe(false);
    expect(synthesis.pinningEvents.length).toBe(0);
    expect(synthesis.conflictEvents.length).toBe(0);
  });

  test("applies diversity factor to multiple confirmations", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM, 1.0),
      createResult("model-b", VerificationOutcome.CONFIRM, 1.0),
      createResult("model-c", VerificationOutcome.CONFIRM, 1.0),
    ]);

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("strengthen");
    expect(synthesis.pinningEvents.length).toBe(3); // Confirmations + abstains

    // First confirmation should have full weight, subsequent have diversity factor applied
    const confirmEvents = synthesis.pinningEvents.filter(
      e => e.kind === PinningEventKind.VERIFICATION
    );
    expect(confirmEvents.length).toBe(3);

    // Weights should diminish
    expect(confirmEvents[0].weight!).toBeGreaterThan(confirmEvents[1].weight!);
    expect(confirmEvents[1].weight!).toBeGreaterThan(confirmEvents[2].weight!);
  });
});

describe("applyVerificationSynthesis", () => {
  test("strengthening increases saturation", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "strengthen",
      confidence: 0.8,
      confirmCount: 2,
      contradictCount: 0,
      abstainCount: 0,
      unavailableCount: 0,
      hasQuorum: true,
      pinningEvents: [
        { kind: PinningEventKind.VERIFICATION, timestamp: Date.now(), weight: 0.2 },
      ],
      conflictEvents: [],
    };

    const newSaturation = applyVerificationSynthesis(
      0.5,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    expect(newSaturation).toBeGreaterThan(0.5);
  });

  test("weakening decreases saturation", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "weaken",
      confidence: 0.8,
      confirmCount: 0,
      contradictCount: 2,
      abstainCount: 0,
      unavailableCount: 0,
      hasQuorum: true,
      pinningEvents: [],
      conflictEvents: [
        { kind: ConflictKind.CONTRADICTION, timestamp: Date.now(), weight: 0.25 },
      ],
    };

    const newSaturation = applyVerificationSynthesis(
      0.8,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    expect(newSaturation).toBeLessThan(0.8);
  });

  test("neutral leaves saturation unchanged", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "neutral",
      confidence: 0.3,
      confirmCount: 1,
      contradictCount: 1,
      abstainCount: 1,
      unavailableCount: 0,
      hasQuorum: true,
      pinningEvents: [],
      conflictEvents: [],
    };

    const newSaturation = applyVerificationSynthesis(
      0.5,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    expect(newSaturation).toBe(0.5);
  });

  test("inconclusive leaves saturation unchanged", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "inconclusive",
      confidence: 0,
      confirmCount: 0,
      contradictCount: 0,
      abstainCount: 0,
      unavailableCount: 2,
      hasQuorum: false,
      pinningEvents: [],
      conflictEvents: [],
    };

    const newSaturation = applyVerificationSynthesis(
      0.5,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    expect(newSaturation).toBe(0.5);
  });
});

describe("shouldBlockCrystallization", () => {
  test("blocks when quorum not met", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "inconclusive",
      confidence: 0,
      confirmCount: 0,
      contradictCount: 0,
      abstainCount: 0,
      unavailableCount: 2,
      hasQuorum: false,
      pinningEvents: [],
      conflictEvents: [],
    };

    expect(shouldBlockCrystallization(synthesis)).toBe(true);
  });

  test("blocks when strong contradiction signal", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "weaken",
      confidence: 0.8,
      confirmCount: 0,
      contradictCount: 2,
      abstainCount: 0,
      unavailableCount: 0,
      hasQuorum: true,
      pinningEvents: [],
      conflictEvents: [{ kind: ConflictKind.CONTRADICTION, timestamp: Date.now() }],
    };

    expect(shouldBlockCrystallization(synthesis, 0.6)).toBe(true);
  });

  test("allows when strengthen verdict", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "strengthen",
      confidence: 0.9,
      confirmCount: 2,
      contradictCount: 0,
      abstainCount: 0,
      unavailableCount: 0,
      hasQuorum: true,
      pinningEvents: [{ kind: PinningEventKind.VERIFICATION, timestamp: Date.now() }],
      conflictEvents: [],
    };

    expect(shouldBlockCrystallization(synthesis)).toBe(false);
  });

  test("allows weak contradiction", () => {
    const synthesis: VerificationSynthesis = {
      verdict: "weaken",
      confidence: 0.3,
      confirmCount: 1,
      contradictCount: 1,
      abstainCount: 0,
      unavailableCount: 0,
      hasQuorum: true,
      pinningEvents: [],
      conflictEvents: [{ kind: ConflictKind.DISPUTED_CLAIM, timestamp: Date.now() }],
    };

    expect(shouldBlockCrystallization(synthesis, 0.6)).toBe(false);
  });
});

describe("createMockVerifier", () => {
  test("returns expected outcomes from map", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.CONFIRM,
      "model-b": VerificationOutcome.CONTRADICT,
    };
    const verifier = createMockVerifier(outcomeMap);

    const resultA = await verifier("model-a", "content");
    const resultB = await verifier("model-b", "content");

    expect(resultA.outcome).toBe(VerificationOutcome.CONFIRM);
    expect(resultB.outcome).toBe(VerificationOutcome.CONTRADICT);
  });

  test("defaults to abstain for unknown models", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {};
    const verifier = createMockVerifier(outcomeMap);

    const result = await verifier("unknown-model", "content");

    expect(result.outcome).toBe(VerificationOutcome.ABSTAIN);
  });

  test("generates deterministic confidence values", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.CONFIRM,
    };
    const verifier = createMockVerifier(outcomeMap);

    const result1 = await verifier("model-a", "content");
    const result2 = await verifier("model-a", "content");

    expect(result1.confidence).toBe(result2.confidence);
    expect(result1.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result1.confidence).toBeLessThanOrEqual(0.99);
  });
});

describe("inspectVerificationWeights", () => {
  test("returns copy of default weights", () => {
    const weights = inspectVerificationWeights();

    expect(weights.confirmWeight).toBe(DEFAULT_CROSS_MODEL_WEIGHTS.confirmWeight);
    expect(weights.contradictWeight).toBe(DEFAULT_CROSS_MODEL_WEIGHTS.contradictWeight);
  });

  test("returns custom weights when provided", () => {
    const customWeights: CrossModelWeights = {
      ...DEFAULT_CROSS_MODEL_WEIGHTS,
      confirmWeight: 0.5,
    };

    const weights = inspectVerificationWeights(customWeights);

    expect(weights.confirmWeight).toBe(0.5);
  });
});

describe("checkVerificationAvailability", () => {
  test("reports healthy when all models available", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM),
      createResult("model-b", VerificationOutcome.CONFIRM),
    ]);

    const status = checkVerificationAvailability(verification);

    expect(status.availableCount).toBe(2);
    expect(status.unavailableCount).toBe(0);
    expect(status.availabilityRate).toBe(1.0);
    expect(status.isHealthy).toBe(true);
  });

  test("reports unhealthy when less than 50% available", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM),
      createResult("model-b", VerificationOutcome.UNAVAILABLE),
      createResult("model-c", VerificationOutcome.UNAVAILABLE),
    ]);

    const status = checkVerificationAvailability(verification);

    expect(status.availabilityRate).toBeCloseTo(0.33, 1);
    expect(status.isHealthy).toBe(false);
  });
});

describe("compareVerificationStrength", () => {
  test("sorts by absolute strength", () => {
    const verifications: CrossModelVerification[] = [
      createVerification("weak-confirm", [
        createResult("a", VerificationOutcome.CONFIRM, 0.5),
      ]),
      createVerification("strong-contradict", [
        createResult("a", VerificationOutcome.CONTRADICT, 0.9),
        createResult("b", VerificationOutcome.CONTRADICT, 0.9),
      ]),
      createVerification("neutral", [
        createResult("a", VerificationOutcome.ABSTAIN),
      ]),
      createVerification("strong-confirm", [
        createResult("a", VerificationOutcome.CONFIRM, 0.9),
        createResult("b", VerificationOutcome.CONFIRM, 0.9),
      ]),
    ];

    const comparison = compareVerificationStrength(verifications);

    // Strong contradict and strong confirm should be first (highest absolute strength)
    expect(Math.abs(comparison[0].strength)).toBeGreaterThan(Math.abs(comparison[2].strength));
    expect(Math.abs(comparison[1].strength)).toBeGreaterThan(Math.abs(comparison[2].strength));
    // Neutral should be last
    expect(comparison[3].strength).toBe(0);
  });
});

describe("Acceptance Criterion AC1: Cross-model verification can strengthen crystallization candidates", () => {
  test("AC1: Multiple confirmations strengthen candidate", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-claude": VerificationOutcome.CONFIRM,
      "model-gpt": VerificationOutcome.CONFIRM,
      "model-kimi": VerificationOutcome.CONFIRM,
    };
    const verifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "crystallization-candidate",
      "important claim",
      ["model-claude", "model-gpt", "model-kimi"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("strengthen");
    expect(synthesis.confirmCount).toBe(3);
    expect(synthesis.pinningEvents.length).toBeGreaterThan(0);

    // Apply to saturation
    const newSaturation = applyVerificationSynthesis(
      0.7,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    expect(newSaturation).toBeGreaterThan(0.7);
    expect(newSaturation).toBeLessThanOrEqual(1.0);
  });
});

describe("Acceptance Criterion AC2: Cross-model verification can weaken crystallization candidates", () => {
  test("AC2: Contradictions weaken candidate and inject entropy", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-claude": VerificationOutcome.CONFIRM,
      "model-gpt": VerificationOutcome.CONTRADICT,
      "model-kimi": VerificationOutcome.CONTRADICT,
    };
    const verifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "questionable-candidate",
      "contested claim",
      ["model-claude", "model-gpt", "model-kimi"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("weaken");
    expect(synthesis.contradictCount).toBe(2);
    expect(synthesis.conflictEvents.length).toBeGreaterThan(0);

    // Apply to saturation
    const newSaturation = applyVerificationSynthesis(
      0.9,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    expect(newSaturation).toBeLessThan(0.9);
    expect(newSaturation).toBeGreaterThanOrEqual(0.0);
  });
});

describe("Acceptance Criterion AC3: Verification outcomes map to explicit pinning or entropy events", () => {
  test("AC3: Strengthen verdict maps to VERIFICATION pinning events", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONFIRM, 0.9),
      createResult("model-b", VerificationOutcome.CONFIRM, 0.85),
    ]);

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("strengthen");

    // All pinning events should be VERIFICATION kind
    const verifyEvents = synthesis.pinningEvents.filter(
      e => e.kind === PinningEventKind.VERIFICATION
    );
    expect(verifyEvents.length).toBeGreaterThan(0);

    // No conflict events for strengthen verdict
    expect(synthesis.conflictEvents.length).toBe(0);

    // Events have explicit weights
    for (const event of synthesis.pinningEvents) {
      expect(event.weight).toBeDefined();
      expect(event.timestamp).toBeDefined();
    }
  });

  test("AC3: Weaken verdict maps to CONTRADICTION conflict events", () => {
    const verification = createVerification("claim-1", [
      createResult("model-a", VerificationOutcome.CONTRADICT, 0.9),
      createResult("model-b", VerificationOutcome.CONTRADICT, 0.85),
    ]);

    const synthesis = synthesizeVerification(verification);

    expect(synthesis.verdict).toBe("weaken");

    // All conflict events should be CONTRADICTION kind
    const contradictionEvents = synthesis.conflictEvents.filter(
      e => e.kind === ConflictKind.CONTRADICTION
    );
    expect(contradictionEvents.length).toBeGreaterThan(0);

    // No pinning events for weaken verdict
    expect(synthesis.pinningEvents.length).toBe(0);

    // Events have explicit weights
    for (const event of synthesis.conflictEvents) {
      expect(event.weight).toBeDefined();
      expect(event.timestamp).toBeDefined();
    }
  });
});

describe("Acceptance Criterion AC4: Unavailable verification degrades gracefully without forging confidence", () => {
  test("AC4: Graceful degradation when all models unavailable", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.UNAVAILABLE,
      "model-b": VerificationOutcome.UNAVAILABLE,
    };
    const verifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "unverifiable-claim",
      "content",
      ["model-a", "model-b"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    // Should be inconclusive, not a forged verdict
    expect(synthesis.verdict).toBe("inconclusive");
    expect(synthesis.hasQuorum).toBe(false);
    expect(synthesis.confidence).toBe(0);

    // No events generated
    expect(synthesis.pinningEvents.length).toBe(0);
    expect(synthesis.conflictEvents.length).toBe(0);

    // Availability check shows unhealthy
    const availability = checkVerificationAvailability(verification);
    expect(availability.availabilityRate).toBe(0);
    expect(availability.isHealthy).toBe(false);
  });

  test("AC4: Partial availability still works with available models", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.CONFIRM,
      "model-b": VerificationOutcome.UNAVAILABLE,
      "model-c": VerificationOutcome.CONFIRM,
    };
    const verifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "partially-verifiable",
      "content",
      ["model-a", "model-b", "model-c"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    // Should proceed with available models
    expect(synthesis.verdict).toBe("strengthen");
    expect(synthesis.hasQuorum).toBe(true);
    expect(synthesis.confirmCount).toBe(2);

    // Unavailable model tracked but doesn't affect outcome
    expect(verification.unavailableModels).toContain("model-b");
  });

  test("AC4: Single available model doesn't meet quorum, blocks confidently", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "model-a": VerificationOutcome.CONFIRM,
      "model-b": VerificationOutcome.UNAVAILABLE,
    };
    const verifier = createMockVerifier(outcomeMap);

    const verification = await verifyAcrossModels(
      "insufficient-verification",
      "content",
      ["model-a", "model-b"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    // Should not proceed without quorum
    expect(synthesis.verdict).toBe("inconclusive");
    expect(synthesis.hasQuorum).toBe(false);

    // Crystallization should be blocked
    expect(shouldBlockCrystallization(synthesis)).toBe(true);
  });
});

describe("Integration: Cross-model verification with existing pinning and entropy", () => {
  test("end-to-end: verification strengthens candidate saturation", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "claude": VerificationOutcome.CONFIRM,
      "gpt": VerificationOutcome.CONFIRM,
      "kimi": VerificationOutcome.CONFIRM,
    };
    const verifier = createMockVerifier(outcomeMap);

    // Initial saturation
    const initialSaturation = 0.85;
    let saturation = initialSaturation;

    // Verify across models
    const verification = await verifyAcrossModels(
      "integration-test",
      "claim content",
      ["claude", "gpt", "kimi"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    // Verify strengthen verdict
    expect(synthesis.verdict).toBe("strengthen");
    expect(synthesis.hasQuorum).toBe(true);

    // Apply verification
    saturation = applyVerificationSynthesis(
      saturation,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    // Saturation should increase
    expect(saturation).toBeGreaterThan(initialSaturation);
    expect(saturation).toBeLessThanOrEqual(1.0);
  });

  test("end-to-end: contradictions weaken candidate saturation", async () => {
    const outcomeMap: Record<ModelId, VerificationOutcome> = {
      "claude": VerificationOutcome.CONFIRM,
      "gpt": VerificationOutcome.CONTRADICT,
      "kimi": VerificationOutcome.CONTRADICT,
      "gemini": VerificationOutcome.CONTRADICT,
    };
    const verifier = createMockVerifier(outcomeMap);

    // High initial saturation
    const initialSaturation = 0.95;
    let saturation = initialSaturation;

    // Verify across models
    const verification = await verifyAcrossModels(
      "contested-claim",
      "contested content",
      ["claude", "gpt", "kimi", "gemini"],
      verifier
    );

    const synthesis = synthesizeVerification(verification);

    // Verify weaken verdict
    expect(synthesis.verdict).toBe("weaken");
    expect(synthesis.hasQuorum).toBe(true);
    expect(synthesis.contradictCount).toBeGreaterThan(synthesis.confirmCount);

    // Apply verification
    saturation = applyVerificationSynthesis(
      saturation,
      synthesis,
      applyPinningSequence,
      applyConflictSequence
    );

    // Saturation should decrease
    expect(saturation).toBeLessThan(initialSaturation);
    expect(saturation).toBeGreaterThanOrEqual(0.0);
  });
});
