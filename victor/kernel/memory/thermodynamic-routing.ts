/**
 * Thermodynamic tier routing
 * 
 * Routes memory based on saturation thresholds to support crystallization
 * of highly resolved memories into permanent storage.
 */

import type { ThermodynamicState } from "./thermodynamic-decay";

/**
 * Memory storage tier
 */
export type MemoryTier = "ephemeral" | "durable" | "crystallized";

/**
 * Thermodynamic routing thresholds
 * 
 * Explicit, inspectable thresholds for tier promotion based on saturation
 */
export interface ThermodynamicRoutingThresholds {
  /** Minimum saturation for crystallized tier (zero-decay ground state) */
  crystallizationThreshold: number;
  /** Minimum saturation for durable tier */
  durableThreshold: number;
  /** Maximum saturation for ephemeral tier */
  ephemeralCeiling: number;
}

/**
 * Default thermodynamic routing thresholds
 */
export const DEFAULT_THERMODYNAMIC_THRESHOLDS: ThermodynamicRoutingThresholds = {
  crystallizationThreshold: 0.95, // 95% saturation = permanent storage
  durableThreshold: 0.60,        // 60% saturation = durable storage
  ephemeralCeiling: 0.60,        // Below 60% = ephemeral
};

/**
 * Route memory to appropriate tier based on saturation
 * 
 * Highly saturated memories (near ground state) can crystallize into permanent storage.
 * 
 * @param saturation Current saturation level (0.0 to 1.0)
 * @param thresholds Routing thresholds (optional, uses defaults if not provided)
 * @returns Memory tier assignment
 */
export function routeByThermodynamicState(
  saturation: number,
  thresholds: ThermodynamicRoutingThresholds = DEFAULT_THERMODYNAMIC_THRESHOLDS
): MemoryTier {
  // Clamp saturation to valid range
  const clampedSaturation = Math.max(0, Math.min(1, saturation));

  if (clampedSaturation >= thresholds.crystallizationThreshold) {
    return "crystallized";
  } else if (clampedSaturation >= thresholds.durableThreshold) {
    return "durable";
  } else {
    return "ephemeral";
  }
}

/**
 * Route memory by full thermodynamic state
 * 
 * Convenience wrapper that extracts saturation from ThermodynamicState
 * 
 * @param state Complete thermodynamic state
 * @param thresholds Routing thresholds (optional)
 * @returns Memory tier assignment
 */
export function routeByState(
  state: ThermodynamicState,
  thresholds?: ThermodynamicRoutingThresholds
): MemoryTier {
  return routeByThermodynamicState(state.saturation, thresholds);
}

/**
 * Score-based tier routing (legacy compatibility)
 * 
 * Routes based on memory score heuristics for backwards compatibility
 * during thermodynamic migration.
 * 
 * @param score Memory score (0.0 to 1.0)
 * @returns Memory tier assignment
 */
export function routeByScore(score: number): MemoryTier {
  const clampedScore = Math.max(0, Math.min(1, score));

  // Legacy score thresholds (aligned with thermodynamic defaults)
  if (clampedScore >= 0.95) {
    return "crystallized";
  } else if (clampedScore >= 0.60) {
    return "durable";
  } else {
    return "ephemeral";
  }
}

/**
 * Hybrid routing decision
 * 
 * Combines thermodynamic and score-based routing during migration.
 * Prefers thermodynamic routing when available, falls back to score-based.
 * 
 * @param saturation Thermodynamic saturation (optional)
 * @param score Memory score (required)
 * @param thresholds Routing thresholds (optional)
 * @returns Memory tier assignment
 */
export function routeHybrid(
  saturation: number | undefined,
  score: number,
  thresholds?: ThermodynamicRoutingThresholds
): MemoryTier {
  // Prefer thermodynamic routing if saturation is available
  if (saturation !== undefined && saturation !== null) {
    return routeByThermodynamicState(saturation, thresholds);
  }

  // Fallback to score-based routing
  return routeByScore(score);
}

/**
 * Check if memory can be promoted to crystallized tier
 * 
 * @param saturation Current saturation level
 * @param thresholds Routing thresholds (optional)
 * @returns True if saturation meets crystallization threshold
 */
export function canCrystallize(
  saturation: number,
  thresholds: ThermodynamicRoutingThresholds = DEFAULT_THERMODYNAMIC_THRESHOLDS
): boolean {
  return saturation >= thresholds.crystallizationThreshold;
}

/**
 * Get explicit routing threshold for a tier
 * 
 * @param tier Target tier
 * @param thresholds Routing thresholds (optional)
 * @returns Minimum saturation threshold for tier
 */
export function getThresholdForTier(
  tier: MemoryTier,
  thresholds: ThermodynamicRoutingThresholds = DEFAULT_THERMODYNAMIC_THRESHOLDS
): number {
  switch (tier) {
    case "crystallized":
      return thresholds.crystallizationThreshold;
    case "durable":
      return thresholds.durableThreshold;
    case "ephemeral":
      return 0.0; // No lower threshold for ephemeral
  }
}
