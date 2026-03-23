/**
 * Saturation-driven memory promotion from L2 (durable) to L3 (crystallized)
 * 
 * Implements explicit tier promotion based on saturation thresholds,
 * enabling memories that reach ground state to be elevated to permanent
 * storage with exact-address lookup capability.
 */

import type { ThermodynamicState } from "./thermodynamic-decay";
import { routeByState, DEFAULT_THERMODYNAMIC_THRESHOLDS, type MemoryTier } from "./thermodynamic-routing";

/**
 * Promotion eligibility status
 */
export type PromotionEligibility = "eligible" | "below-threshold" | "already-crystallized";

/**
 * Promotion result
 */
export interface PromotionResult {
  /** Whether promotion was performed */
  promoted: boolean;
  /** Reason for promotion or rejection */
  reason: string;
  /** Source tier before promotion */
  sourceTier: MemoryTier;
  /** Target tier after promotion */
  targetTier: MemoryTier;
}

/**
 * Memory reference for promotion
 */
export interface PromotableMemory {
  /** Memory identifier */
  memoryId: string;
  /** Current thermodynamic state */
  thermodynamicState: ThermodynamicState;
  /** Current storage tier */
  currentTier: MemoryTier;
}

/**
 * Check if memory is eligible for saturation-driven promotion to crystallized tier
 * 
 * @param memory Memory to check
 * @param crystallizationThreshold Minimum saturation for crystallization (default: 0.95)
 * @returns Eligibility status
 */
export function checkPromotionEligibility(
  memory: PromotableMemory,
  crystallizationThreshold: number = DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold
): PromotionEligibility {
  const { saturation } = memory.thermodynamicState;
  
  if (memory.currentTier === "crystallized") {
    return "already-crystallized";
  }
  
  if (saturation >= crystallizationThreshold) {
    return "eligible";
  }
  
  return "below-threshold";
}

/**
 * Promote memory from L2 (durable) to L3 (crystallized) based on saturation threshold
 * 
 * This is an explicit promotion operation, not implicit routing drift.
 * Only memories that have reached the crystallization threshold are promoted.
 * 
 * @param memory Memory to promote
 * @param crystallizationThreshold Minimum saturation for crystallization (default: 0.95)
 * @returns Promotion result with source and target tiers
 */
export function promoteToCrystallized(
  memory: PromotableMemory,
  crystallizationThreshold: number = DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold
): PromotionResult {
  const eligibility = checkPromotionEligibility(memory, crystallizationThreshold);
  const sourceTier = memory.currentTier;
  
  if (eligibility === "already-crystallized") {
    return {
      promoted: false,
      reason: "Memory already in crystallized tier",
      sourceTier,
      targetTier: "crystallized"
    };
  }
  
  if (eligibility === "below-threshold") {
    const { saturation } = memory.thermodynamicState;
    return {
      promoted: false,
      reason: `Saturation ${saturation.toFixed(3)} below crystallization threshold ${crystallizationThreshold.toFixed(3)}`,
      sourceTier,
      targetTier: sourceTier
    };
  }
  
  // Eligible for promotion
  const { saturation } = memory.thermodynamicState;
  return {
    promoted: true,
    reason: `Saturation ${saturation.toFixed(3)} reached crystallization threshold ${crystallizationThreshold.toFixed(3)}`,
    sourceTier,
    targetTier: "crystallized"
  };
}

/**
 * Batch promotion - scan memories and promote all eligible candidates
 * 
 * @param memories Array of memories to scan for promotion
 * @param crystallizationThreshold Minimum saturation for crystallization (default: 0.95)
 * @returns Array of promotion results
 */
export function promoteBatch(
  memories: PromotableMemory[],
  crystallizationThreshold: number = DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold
): PromotionResult[] {
  return memories.map(memory => promoteToCrystallized(memory, crystallizationThreshold));
}

/**
 * Count eligible promotion candidates in a memory set
 * 
 * @param memories Array of memories to scan
 * @param crystallizationThreshold Minimum saturation for crystallization (default: 0.95)
 * @returns Count of eligible memories
 */
export function countEligibleForPromotion(
  memories: PromotableMemory[],
  crystallizationThreshold: number = DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold
): number {
  return memories.filter(
    memory => checkPromotionEligibility(memory, crystallizationThreshold) === "eligible"
  ).length;
}

/**
 * Find all memories eligible for promotion
 * 
 * @param memories Array of memories to scan
 * @param crystallizationThreshold Minimum saturation for crystallization (default: 0.95)
 * @returns Array of eligible memories
 */
export function findEligibleMemories(
  memories: PromotableMemory[],
  crystallizationThreshold: number = DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold
): PromotableMemory[] {
  return memories.filter(
    memory => checkPromotionEligibility(memory, crystallizationThreshold) === "eligible"
  );
}

/**
 * Inspect promotion status for a memory
 * 
 * Returns detailed information about promotion eligibility and state
 * 
 * @param memory Memory to inspect
 * @param crystallizationThreshold Minimum saturation for crystallization (default: 0.95)
 * @returns Inspection details
 */
export function inspectPromotionStatus(
  memory: PromotableMemory,
  crystallizationThreshold: number = DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold
) {
  const { saturation, temperature, effectiveLambda } = memory.thermodynamicState;
  const eligibility = checkPromotionEligibility(memory, crystallizationThreshold);
  const saturationGap = crystallizationThreshold - saturation;
  
  return {
    memoryId: memory.memoryId,
    currentTier: memory.currentTier,
    eligibility,
    saturation,
    temperature,
    effectiveLambda,
    crystallizationThreshold,
    saturationGap: saturationGap > 0 ? saturationGap : 0,
    isGroundState: saturation >= 0.999 && effectiveLambda <= 0.001
  };
}
