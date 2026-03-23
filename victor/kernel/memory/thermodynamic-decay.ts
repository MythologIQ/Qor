/**
 * Thermodynamic Decay and Saturation Boost Functions
 * 
 * Implements memory decay based on thermodynamic principles where:
 * - Saturation represents resolvedness (0 = unresolved, 1 = fully resolved)
 * - Temperature derives from saturation (high saturation = low temperature = stable)
 * - Effective lambda (decay rate) decreases as saturation increases
 * - Saturated memories can reach zero-decay ground state
 * - Access-driven saturation boosts are deterministic and bounded
 */

export interface ThermodynamicState {
  saturation: number;           // 0.0 to 1.0, represents resolvedness
  temperature: number;           // Derived from saturation
  effectiveLambda: number;       // Decay rate, inversely proportional to saturation
  lastAccessedAt: number;        // Epoch ms
  accessCount: number;           // Total access count for saturation boost
}

export interface DecayParameters {
  baseLambda: number;            // Base decay rate (e.g., 0.693 for half-life of 1 time unit)
  saturationFloor: number;       // Minimum saturation (default: 0.0)
  saturationCeiling: number;     // Maximum saturation (default: 1.0)
  tempMin: number;               // Minimum temperature (default: 0.0)
  tempMax: number;               // Maximum temperature (default: 1.0)
  boostPerAccess: number;        // Saturation increase per access (default: 0.05)
  boostDecayFactor: number;      // Diminishing returns factor (default: 0.9)
}

export const DEFAULT_DECAY_PARAMS: DecayParameters = {
  baseLambda: 0.693,             // ln(2), giving half-life of 1 time unit
  saturationFloor: 0.0,
  saturationCeiling: 1.0,
  tempMin: 0.0,
  tempMax: 1.0,
  boostPerAccess: 0.15,          // 15% of remaining capacity per access
  boostDecayFactor: 0.9,         // (unused in current impl, kept for compatibility)
};

/**
 * Calculate context temperature from saturation
 * High saturation → low temperature (stable, resolved)
 * Low saturation → high temperature (volatile, unresolved)
 */
export function calculateTemperature(
  saturation: number,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): number {
  const normalized = Math.max(
    params.saturationFloor,
    Math.min(params.saturationCeiling, saturation)
  );
  
  // Inverse relationship: T = T_max * (1 - saturation)
  return params.tempMax * (1.0 - normalized);
}

/**
 * Calculate effective lambda (decay rate) from saturation
 * High saturation → low decay (approaches zero at full saturation)
 * Low saturation → base decay rate
 */
export function calculateEffectiveLambda(
  saturation: number,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): number {
  const normalized = Math.max(
    params.saturationFloor,
    Math.min(params.saturationCeiling, saturation)
  );
  
  // Ground state: λ_eff = λ_base * (1 - saturation)
  // At saturation = 1.0, λ_eff = 0 (zero decay)
  // At saturation = 0.0, λ_eff = λ_base (full decay)
  return params.baseLambda * (1.0 - normalized);
}

/**
 * Calculate memory decay score at a given time
 * Uses exponential decay: score(t) = score₀ * e^(-λ_eff * Δt)
 * 
 * @param initialScore - Initial memory score
 * @param saturation - Current saturation level
 * @param deltaTimeMs - Time elapsed since last access (milliseconds)
 * @param params - Decay parameters
 * @returns Decayed score
 */
export function applyThermodynamicDecay(
  initialScore: number,
  saturation: number,
  deltaTimeMs: number,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): number {
  const effectiveLambda = calculateEffectiveLambda(saturation, params);
  
  // Convert time to normalized units (assuming base lambda is per day)
  const deltaTimeNormalized = deltaTimeMs / (24 * 60 * 60 * 1000);
  
  // Exponential decay: S(t) = S₀ * e^(-λ * t)
  const decayFactor = Math.exp(-effectiveLambda * deltaTimeNormalized);
  
  return initialScore * decayFactor;
}

/**
 * Calculate saturation boost from access
 * Implements bounded, deterministic boost with diminishing returns
 * 
 * @param currentSaturation - Current saturation level
 * @param accessCount - Number of accesses to apply
 * @param params - Decay parameters
 * @returns New saturation level after boost
 */
export function applyAccessBoost(
  currentSaturation: number,
  accessCount: number = 1,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): number {
  let saturation = Math.max(
    params.saturationFloor,
    Math.min(params.saturationCeiling, currentSaturation)
  );
  
  // Apply boost with exponential convergence to ceiling
  // Each boost moves a fraction of remaining distance to ceiling
  for (let i = 0; i < accessCount; i++) {
    const remainingCapacity = params.saturationCeiling - saturation;
    const boost = remainingCapacity * params.boostPerAccess;
    
    saturation = Math.min(
      params.saturationCeiling,
      saturation + boost
    );
  }
  
  // Snap to ceiling if within epsilon (handle floating point precision)
  if (saturation >= params.saturationCeiling - 1e-3) {
    saturation = params.saturationCeiling;
  }
  
  return saturation;
}

/**
 * Update thermodynamic state after memory access
 * Applies saturation boost and recalculates derived properties
 * 
 * @param currentState - Current thermodynamic state
 * @param params - Decay parameters
 * @returns Updated thermodynamic state
 */
export function updateStateOnAccess(
  currentState: ThermodynamicState,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): ThermodynamicState {
  const newSaturation = applyAccessBoost(
    currentState.saturation,
    1,
    params
  );
  
  const now = Date.now();
  
  return {
    saturation: newSaturation,
    temperature: calculateTemperature(newSaturation, params),
    effectiveLambda: calculateEffectiveLambda(newSaturation, params),
    lastAccessedAt: now,
    accessCount: currentState.accessCount + 1,
  };
}

/**
 * Initialize thermodynamic state for a new memory
 * 
 * @param initialSaturation - Starting saturation level (default: 0.0)
 * @param params - Decay parameters
 * @returns Initial thermodynamic state
 */
export function initializeThermodynamicState(
  initialSaturation: number = 0.0,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): ThermodynamicState {
  const saturation = Math.max(
    params.saturationFloor,
    Math.min(params.saturationCeiling, initialSaturation)
  );
  
  return {
    saturation,
    temperature: calculateTemperature(saturation, params),
    effectiveLambda: calculateEffectiveLambda(saturation, params),
    lastAccessedAt: Date.now(),
    accessCount: 0,
  };
}

/**
 * Check if memory has reached ground state (zero decay)
 * Ground state is achieved when saturation reaches ceiling
 * 
 * @param state - Thermodynamic state to check
 * @param params - Decay parameters
 * @returns True if memory is in ground state
 */
export function isGroundState(
  state: ThermodynamicState,
  params: DecayParameters = DEFAULT_DECAY_PARAMS
): boolean {
  return state.saturation >= params.saturationCeiling;
}
