/**
 * Weighted Pinning Hierarchy
 * 
 * Implements differentiated pinning events where cryptographic verification,
 * corroboration, and cross-reference contribute more saturation boost than
 * ordinary access, enabling legitimate crystallization through grounded evidence.
 * 
 * Design principles:
 * - Verification events (cryptographic proof) carry highest weight
 * - Corroboration events (cross-reference validation) carry medium weight  
 * - Ordinary access events carry baseline weight
 * - All weights are bounded, explicit, and inspectable
 * - Accumulated boosts remain deterministic and testable
 */

export enum PinningEventKind {
  ORDINARY_ACCESS = 'ordinary-access',
  CORROBORATION = 'corroboration',
  VERIFICATION = 'verification',
}

export interface PinningEvent {
  kind: PinningEventKind;
  timestamp: number;      // Epoch ms
  weight?: number;        // Optional override for custom weighting
}

export interface PinningWeights {
  ordinaryAccess: number;   // Baseline weight for normal access
  corroboration: number;    // Medium weight for cross-reference validation
  verification: number;     // Highest weight for cryptographic proof
  ceiling: number;          // Maximum saturation (hard limit)
}

export interface PinningParameters extends PinningWeights {
  diminishingFactor: number;  // Exponential decay for repeated pins (0-1)
}

export const DEFAULT_PINNING_WEIGHTS: PinningWeights = {
  ordinaryAccess: 0.05,    // 5% of remaining capacity per ordinary access
  corroboration: 0.15,     // 15% of remaining capacity per corroboration
  verification: 0.30,      // 30% of remaining capacity per verification
  ceiling: 1.0,            // Maximum saturation (ground state)
};

export const DEFAULT_PINNING_PARAMS: PinningParameters = {
  ...DEFAULT_PINNING_WEIGHTS,
  diminishingFactor: 0.85,  // Each subsequent event of same kind has 85% effectiveness
};

/**
 * Get the weight for a specific pinning event kind
 */
export function getPinningWeight(
  kind: PinningEventKind,
  weights: PinningWeights = DEFAULT_PINNING_WEIGHTS
): number {
  switch (kind) {
    case PinningEventKind.ORDINARY_ACCESS:
      return weights.ordinaryAccess;
    case PinningEventKind.CORROBORATION:
      return weights.corroboration;
    case PinningEventKind.VERIFICATION:
      return weights.verification;
    default:
      return weights.ordinaryAccess;
  }
}

/**
 * Apply a single pinning event to current saturation
 * Uses bounded exponential convergence: Δs = weight * (ceiling - current)
 */
export function applySinglePinning(
  currentSaturation: number,
  event: PinningEvent,
  params: PinningParameters = DEFAULT_PINNING_PARAMS
): number {
  const weight = event.weight !== undefined 
    ? event.weight 
    : getPinningWeight(event.kind, params);
  
  // Bounded boost: can only fill remaining capacity
  const remainingCapacity = Math.max(0, params.ceiling - currentSaturation);
  const boost = weight * remainingCapacity;
  
  const newSaturation = currentSaturation + boost;
  
  // Hard ceiling enforcement
  return Math.min(params.ceiling, Math.max(0, newSaturation));
}

/**
 * Apply multiple pinning events sequentially with diminishing returns
 * Each subsequent event of the same kind has reduced effectiveness
 */
export function applyPinningSequence(
  initialSaturation: number,
  events: PinningEvent[],
  params: PinningParameters = DEFAULT_PINNING_PARAMS
): number {
  let saturation = initialSaturation;
  const kindCounts = new Map<PinningEventKind, number>();
  
  for (const event of events) {
    // Track how many times we've seen this kind
    const priorCount = kindCounts.get(event.kind) || 0;
    kindCounts.set(event.kind, priorCount + 1);
    
    // Apply diminishing returns for repeated events of same kind
    const baseWeight = event.weight !== undefined
      ? event.weight
      : getPinningWeight(event.kind, params);
    
    const diminishedWeight = baseWeight * Math.pow(params.diminishingFactor, priorCount);
    
    // Create effective event with diminished weight
    const effectiveEvent: PinningEvent = {
      ...event,
      weight: diminishedWeight,
    };
    
    saturation = applySinglePinning(saturation, effectiveEvent, params);
  }
  
  return saturation;
}

/**
 * Calculate saturation boost from a batch of pinning events
 * Returns the delta saturation (new - initial)
 */
export function calculatePinningBoost(
  initialSaturation: number,
  events: PinningEvent[],
  params: PinningParameters = DEFAULT_PINNING_PARAMS
): number {
  const finalSaturation = applyPinningSequence(initialSaturation, events, params);
  return finalSaturation - initialSaturation;
}

/**
 * Determine if saturation meets crystallization threshold after pinning
 * This is a convenience function for promotion gate logic
 */
export function canCrystallizeAfterPinning(
  currentSaturation: number,
  events: PinningEvent[],
  crystallizationThreshold: number = 0.95,
  params: PinningParameters = DEFAULT_PINNING_PARAMS
): boolean {
  const finalSaturation = applyPinningSequence(currentSaturation, events, params);
  return finalSaturation >= crystallizationThreshold;
}

/**
 * Compare effectiveness of different pinning strategies
 * Returns saturation delta for each event kind given the same initial state
 */
export function comparePinningEffectiveness(
  initialSaturation: number,
  params: PinningParameters = DEFAULT_PINNING_PARAMS
): Record<PinningEventKind, number> {
  const results: Record<PinningEventKind, number> = {} as any;
  
  for (const kind of Object.values(PinningEventKind)) {
    const event: PinningEvent = {
      kind: kind as PinningEventKind,
      timestamp: Date.now(),
    };
    const finalSaturation = applySinglePinning(initialSaturation, event, params);
    results[kind as PinningEventKind] = finalSaturation - initialSaturation;
  }
  
  return results;
}

/**
 * Inspect current pinning weights configuration
 * Returns the active weights for audit and governance visibility
 */
export function inspectPinningWeights(
  params: PinningParameters = DEFAULT_PINNING_PARAMS
): PinningWeights {
  return {
    ordinaryAccess: params.ordinaryAccess,
    corroboration: params.corroboration,
    verification: params.verification,
    ceiling: params.ceiling,
  };
}
