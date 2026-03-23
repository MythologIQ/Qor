/**
 * Cross-Model Verification for Pre-Crystallization Fiber Pinning
 *
 * Implements multi-model verification as a stronger corroboration primitive
 * so claims can be pinned or reheated before they harden into durable memory.
 *
 * Design principles:
 * - Multiple independent model verification strengthens crystallization candidates
 * - Verification conflicts inject entropy to weaken questionable candidates
 * - Unavailable verification degrades gracefully without forging confidence
 * - All verification outcomes map to explicit pinning or entropy events
 * - Deterministic and auditable for governance review
 */

import { PinningEvent, PinningEventKind } from "./weighted-pinning";
import { ConflictEvent, ConflictKind } from "./entropy-injection";

/**
 * Unique identifier for a verification model
 */
export type ModelId = string;

/**
 * Verification outcome from a single model
 */
export enum VerificationOutcome {
  CONFIRM = "confirm",       // Model confirms the claim
  CONTRADICT = "contradict", // Model contradicts the claim
  ABSTAIN = "abstain",       // Model abstains (insufficient information)
  UNAVAILABLE = "unavailable", // Model unavailable for verification
}

/**
 * Result of verifying a claim with a specific model
 */
export interface ModelVerificationResult {
  modelId: ModelId;
  outcome: VerificationOutcome;
  confidence: number;         // 0.0 to 1.0, model's confidence in outcome
  timestamp: number;          // Epoch ms
  reasoning?: string;          // Optional reasoning for outcome
}

/**
 * Complete cross-model verification set for a claim
 */
export interface CrossModelVerification {
  claimId: string;
  verifiedAt: number;
  results: ModelVerificationResult[];
  participatingModels: ModelId[];
  unavailableModels: ModelId[];
}

/**
 * Configuration for cross-model verification weights
 */
export interface CrossModelWeights {
  /** Weight per confirming model (scales with confidence) */
  confirmWeight: number;
  /** Weight per contradicting model (scales with confidence) */
  contradictWeight: number;
  /** Weight for abstention (neutral, minimal impact) */
  abstainWeight: number;
  /** Minimum models required for meaningful verification */
  minModelsForVerification: number;
  /** Diminishing returns factor for multiple confirmations from similar models */
  diversityFactor: number;
}

export const DEFAULT_CROSS_MODEL_WEIGHTS: CrossModelWeights = {
  confirmWeight: 0.20,        // Each confirmation adds up to 20% boost
  contradictWeight: 0.25,     // Each contradiction reduces up to 25%
  abstainWeight: 0.02,       // Abstention has minimal 2% pinning effect
  minModelsForVerification: 2, // Need at least 2 models for cross-model verification
  diversityFactor: 0.85,      // Similar models have reduced effectiveness
};

/**
 * Verification synthesis result
 */
export interface VerificationSynthesis {
  /** Overall verdict based on verification */
  verdict: "strengthen" | "weaken" | "neutral" | "inconclusive";
  /** Confidence in the verdict (0.0 to 1.0) */
  confidence: number;
  /** Number of confirming models */
  confirmCount: number;
  /** Number of contradicting models */
  contradictCount: number;
  /** Number of abstaining models */
  abstainCount: number;
  /** Number of unavailable models */
  unavailableCount: number;
  /** Whether enough models participated for meaningful verification */
  hasQuorum: boolean;
  /** Pinning events to apply (if strengthening) */
  pinningEvents: PinningEvent[];
  /** Conflict events to apply (if weakening) */
  conflictEvents: ConflictEvent[];
}

/**
 * Verify a claim across multiple models
 * Collects results from all participating models
 */
export async function verifyAcrossModels(
  claimId: string,
  claimContent: string,
  modelIds: ModelId[],
  verifyFn: (modelId: ModelId, content: string) => Promise<ModelVerificationResult>
): Promise<CrossModelVerification> {
  const results: ModelVerificationResult[] = [];
  const unavailableModels: ModelId[] = [];
  const now = Date.now();

  for (const modelId of modelIds) {
    try {
      const result = await verifyFn(modelId, claimContent);
      results.push({
        ...result,
        modelId,
        timestamp: now,
      });

      if (result.outcome === VerificationOutcome.UNAVAILABLE) {
        unavailableModels.push(modelId);
      }
    } catch (error) {
      // Graceful degradation: mark as unavailable on error
      unavailableModels.push(modelId);
      results.push({
        modelId,
        outcome: VerificationOutcome.UNAVAILABLE,
        confidence: 0,
        timestamp: now,
        reasoning: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return {
    claimId,
    verifiedAt: now,
    results,
    participatingModels: modelIds.filter(id => !unavailableModels.includes(id)),
    unavailableModels,
  };
}

/**
 * Synthesize cross-model verification results into actionable verdict
 * Maps outcomes to explicit pinning or entropy events
 */
export function synthesizeVerification(
  verification: CrossModelVerification,
  weights: CrossModelWeights = DEFAULT_CROSS_MODEL_WEIGHTS
): VerificationSynthesis {
  const confirmCount = verification.results.filter(
    r => r.outcome === VerificationOutcome.CONFIRM
  ).length;
  const contradictCount = verification.results.filter(
    r => r.outcome === VerificationOutcome.CONTRADICT
  ).length;
  const abstainCount = verification.results.filter(
    r => r.outcome === VerificationOutcome.ABSTAIN
  ).length;
  const unavailableCount = verification.results.filter(
    r => r.outcome === VerificationOutcome.UNAVAILABLE
  ).length;

  const participatingCount = verification.results.length - unavailableCount;
  const hasQuorum = participatingCount >= weights.minModelsForVerification;

  // Calculate weighted confidence for confirmations
  const confirmConfidence = verification.results
    .filter(r => r.outcome === VerificationOutcome.CONFIRM)
    .reduce((sum, r) => sum + r.confidence, 0);

  // Calculate weighted confidence for contradictions
  const contradictConfidence = verification.results
    .filter(r => r.outcome === VerificationOutcome.CONTRADICT)
    .reduce((sum, r) => sum + r.confidence, 0);

  // Determine verdict based on weighted outcomes
  let verdict: VerificationSynthesis["verdict"];
  let confidence: number;
  const pinningEvents: PinningEvent[] = [];
  const conflictEvents: ConflictEvent[] = [];

  if (!hasQuorum) {
    verdict = "inconclusive";
    confidence = 0;
  } else if (confirmConfidence > contradictConfidence * 1.5) {
    // Strong confirmation: strengthen
    verdict = "strengthen";
    confidence = Math.min(1.0, confirmConfidence / participatingCount);

    // Create pinning events for each confirmation
    const confirms = verification.results.filter(r => r.outcome === VerificationOutcome.CONFIRM);
    for (let i = 0; i < confirms.length; i++) {
      const r = confirms[i];
      // Apply diversity factor for subsequent confirmations
      const effectiveWeight = weights.confirmWeight * r.confidence * Math.pow(weights.diversityFactor, i);
      pinningEvents.push({
        kind: PinningEventKind.VERIFICATION,
        timestamp: r.timestamp,
        weight: effectiveWeight,
      });
    }

    // Minimal pinning for abstentions
    for (const r of verification.results.filter(r => r.outcome === VerificationOutcome.ABSTAIN)) {
      pinningEvents.push({
        kind: PinningEventKind.ORDINARY_ACCESS,
        timestamp: r.timestamp,
        weight: weights.abstainWeight,
      });
    }
  } else if (contradictConfidence > confirmConfidence) {
    // Contradiction wins: weaken
    verdict = "weaken";
    confidence = Math.min(1.0, contradictConfidence / participatingCount);

    // Create conflict events for each contradiction
    for (const r of verification.results.filter(r => r.outcome === VerificationOutcome.CONTRADICT)) {
      conflictEvents.push({
        kind: ConflictKind.CONTRADICTION,
        timestamp: r.timestamp,
        weight: weights.contradictWeight * r.confidence,
      });
    }
  } else {
    // Mixed or weak signals: neutral
    verdict = "neutral";
    confidence = Math.min(confirmConfidence, contradictConfidence) / participatingCount;

    // Minimal pinning for confirmations, minimal entropy for contradictions
    for (const r of verification.results.filter(r => r.outcome === VerificationOutcome.CONFIRM)) {
      pinningEvents.push({
        kind: PinningEventKind.CORROBORATION,
        timestamp: r.timestamp,
        weight: weights.abstainWeight * r.confidence,
      });
    }
    for (const r of verification.results.filter(r => r.outcome === VerificationOutcome.CONTRADICT)) {
      conflictEvents.push({
        kind: ConflictKind.DISPUTED_CLAIM,
        timestamp: r.timestamp,
        weight: weights.abstainWeight * r.confidence,
      });
    }
  }

  return {
    verdict,
    confidence,
    confirmCount,
    contradictCount,
    abstainCount,
    unavailableCount,
    hasQuorum,
    pinningEvents,
    conflictEvents,
  };
}

/**
 * Apply verification synthesis to a saturation value
 * Returns new saturation after applying pinning or entropy events
 */
export function applyVerificationSynthesis(
  currentSaturation: number,
  synthesis: VerificationSynthesis,
  applyPinningFn: (saturation: number, events: PinningEvent[]) => number,
  applyEntropyFn: (saturation: number, events: ConflictEvent[]) => number
): number {
  let newSaturation = currentSaturation;

  if (synthesis.verdict === "strengthen" && synthesis.pinningEvents.length > 0) {
    newSaturation = applyPinningFn(newSaturation, synthesis.pinningEvents);
  } else if (synthesis.verdict === "weaken" && synthesis.conflictEvents.length > 0) {
    newSaturation = applyEntropyFn(newSaturation, synthesis.conflictEvents);
  }
  // "neutral" and "inconclusive" verdicts leave saturation unchanged

  return newSaturation;
}

/**
 * Check if cross-model verification should block crystallization
 * Returns true if contradictions outweigh confirmations significantly
 */
export function shouldBlockCrystallization(
  synthesis: VerificationSynthesis,
  blockThreshold: number = 0.6
): boolean {
  if (!synthesis.hasQuorum) {
    return true; // Block if insufficient verification
  }

  if (synthesis.verdict === "weaken" && synthesis.confidence > blockThreshold) {
    return true; // Block if strong contradiction signal
  }

  return false;
}

/**
 * Create a deterministic mock verification function for testing
 * Returns predictable outcomes based on model ID patterns
 */
export function createMockVerifier(
  outcomeMap: Record<ModelId, VerificationOutcome>
): (modelId: ModelId, content: string) => Promise<ModelVerificationResult> {
  return async (modelId: ModelId, content: string) => {
    const outcome = outcomeMap[modelId] ?? VerificationOutcome.ABSTAIN;

    // Deterministic confidence based on model ID hash
    const confidenceHash = modelId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const confidence = 0.7 + (confidenceHash % 30) / 100; // 0.7 to 0.99

    return {
      modelId,
      outcome,
      confidence,
      timestamp: Date.now(),
      reasoning: `Mock verification: ${outcome}`,
    };
  };
}

/**
 * Inspect current verification weights and configuration
 * Returns the active weights for audit and governance visibility
 */
export function inspectVerificationWeights(
  weights: CrossModelWeights = DEFAULT_CROSS_MODEL_WEIGHTS
): CrossModelWeights {
  return { ...weights };
}

/**
 * Check verification availability status
 * Returns summary of which models are available vs unavailable
 */
export function checkVerificationAvailability(
  verification: CrossModelVerification
): {
  availableCount: number;
  unavailableCount: number;
  availabilityRate: number;
  isHealthy: boolean;
} {
  const total = verification.results.length;
  const unavailable = verification.unavailableModels.length;
  const available = total - unavailable;
  const availabilityRate = total > 0 ? available / total : 0;

  return {
    availableCount: available,
    unavailableCount: unavailable,
    availabilityRate,
    isHealthy: availabilityRate >= 0.5, // Healthy if at least 50% available
  };
}

/**
 * Compare verification strength across different claim sets
 * Useful for prioritizing which claims need verification attention
 */
export function compareVerificationStrength(
  verifications: CrossModelVerification[]
): Array<{
  claimId: string;
  strength: number;
  verdict: VerificationSynthesis["verdict"];
  confidence: number;
}> {
  return verifications.map(v => {
    const synthesis = synthesizeVerification(v);
    // Strength score: 1.0 for strong confirm, -1.0 for strong contradict, 0 for neutral
    const strength = synthesis.verdict === "strengthen"
      ? synthesis.confidence
      : synthesis.verdict === "weaken"
        ? -synthesis.confidence
        : 0;

    return {
      claimId: v.claimId,
      strength,
      verdict: synthesis.verdict,
      confidence: synthesis.confidence,
    };
  }).sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength)); // Sort by absolute strength
}
