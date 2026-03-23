import { describe, it, expect } from 'bun:test';
import {
  PinningEventKind,
  type PinningEvent,
  type PinningWeights,
  type PinningParameters,
  DEFAULT_PINNING_WEIGHTS,
  DEFAULT_PINNING_PARAMS,
  getPinningWeight,
  applySinglePinning,
  applyPinningSequence,
  calculatePinningBoost,
  canCrystallizeAfterPinning,
  comparePinningEffectiveness,
  inspectPinningWeights,
} from './weighted-pinning';

describe('Weighted Pinning - Weight Assignment', () => {
  it('should assign baseline weight to ordinary access', () => {
    const weight = getPinningWeight(PinningEventKind.ORDINARY_ACCESS);
    expect(weight).toBe(0.05);
  });

  it('should assign medium weight to corroboration', () => {
    const weight = getPinningWeight(PinningEventKind.CORROBORATION);
    expect(weight).toBe(0.15);
  });

  it('should assign highest weight to verification', () => {
    const weight = getPinningWeight(PinningEventKind.VERIFICATION);
    expect(weight).toBe(0.30);
  });

  it('should respect custom weights configuration', () => {
    const customWeights: PinningWeights = {
      ordinaryAccess: 0.10,
      corroboration: 0.20,
      verification: 0.40,
      ceiling: 1.0,
    };
    
    expect(getPinningWeight(PinningEventKind.ORDINARY_ACCESS, customWeights)).toBe(0.10);
    expect(getPinningWeight(PinningEventKind.CORROBORATION, customWeights)).toBe(0.20);
    expect(getPinningWeight(PinningEventKind.VERIFICATION, customWeights)).toBe(0.40);
  });

  it('should enforce weight hierarchy: verification > corroboration > ordinary', () => {
    const weights = DEFAULT_PINNING_WEIGHTS;
    expect(weights.verification).toBeGreaterThan(weights.corroboration);
    expect(weights.corroboration).toBeGreaterThan(weights.ordinaryAccess);
  });
});

describe('Weighted Pinning - Single Event Application', () => {
  it('should increase saturation for ordinary access', () => {
    const event: PinningEvent = {
      kind: PinningEventKind.ORDINARY_ACCESS,
      timestamp: Date.now(),
    };
    
    const initial = 0.5;
    const final = applySinglePinning(initial, event);
    
    expect(final).toBeGreaterThan(initial);
    expect(final).toBe(0.5 + 0.05 * (1.0 - 0.5)); // 0.5 + 0.025 = 0.525
  });

  it('should increase saturation more for verification than ordinary access', () => {
    const ordinaryEvent: PinningEvent = {
      kind: PinningEventKind.ORDINARY_ACCESS,
      timestamp: Date.now(),
    };
    
    const verificationEvent: PinningEvent = {
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now(),
    };
    
    const initial = 0.5;
    const afterOrdinary = applySinglePinning(initial, ordinaryEvent);
    const afterVerification = applySinglePinning(initial, verificationEvent);
    
    expect(afterVerification).toBeGreaterThan(afterOrdinary);
  });

  it('should respect saturation ceiling', () => {
    const event: PinningEvent = {
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now(),
    };
    
    const nearCeiling = 0.98;
    const final = applySinglePinning(nearCeiling, event);
    
    expect(final).toBeLessThanOrEqual(1.0);
    expect(final).toBeGreaterThan(nearCeiling);
  });

  it('should not decrease saturation', () => {
    const event: PinningEvent = {
      kind: PinningEventKind.ORDINARY_ACCESS,
      timestamp: Date.now(),
    };
    
    const initial = 0.7;
    const final = applySinglePinning(initial, event);
    
    expect(final).toBeGreaterThanOrEqual(initial);
  });

  it('should handle zero saturation', () => {
    const event: PinningEvent = {
      kind: PinningEventKind.ORDINARY_ACCESS,
      timestamp: Date.now(),
    };
    
    const final = applySinglePinning(0.0, event);
    expect(final).toBe(0.05); // 0.05 * 1.0 = 0.05
  });

  it('should handle full saturation (no headroom)', () => {
    const event: PinningEvent = {
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now(),
    };
    
    const final = applySinglePinning(1.0, event);
    expect(final).toBe(1.0); // No change, already at ceiling
  });

  it('should allow custom weight override', () => {
    const event: PinningEvent = {
      kind: PinningEventKind.ORDINARY_ACCESS,
      timestamp: Date.now(),
      weight: 0.50, // Override with higher weight
    };
    
    const initial = 0.5;
    const final = applySinglePinning(initial, event);
    
    expect(final).toBe(0.5 + 0.50 * 0.5); // 0.5 + 0.25 = 0.75
  });
});

describe('Weighted Pinning - Sequential Events with Diminishing Returns', () => {
  it('should apply multiple events sequentially', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() },
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() + 1 },
    ];
    
    const initial = 0.5;
    const final = applyPinningSequence(initial, events);
    
    expect(final).toBeGreaterThan(initial);
  });

  it('should apply diminishing returns for repeated events of same kind', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() },
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() + 1 },
    ];
    
    const initial = 0.0;
    
    // First event: 0.0 + 0.05 * 1.0 = 0.05
    // Second event: 0.05 + (0.05 * 0.85) * 0.95 = 0.05 + 0.040375 = 0.090375
    const final = applyPinningSequence(initial, events);
    
    expect(final).toBeGreaterThan(0.05); // More than one event
    expect(final).toBeLessThan(0.10); // But less than 2x due to diminishing
  });

  it('should not apply diminishing returns across different event kinds', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() },
      { kind: PinningEventKind.CORROBORATION, timestamp: Date.now() + 1 },
    ];
    
    const initial = 0.0;
    const final = applyPinningSequence(initial, events);
    
    // First: 0.0 + 0.05 * 1.0 = 0.05
    // Second: 0.05 + 0.15 * 0.95 = 0.05 + 0.1425 = 0.1925
    expect(final).toBeCloseTo(0.1925, 4);
  });

  it('should converge to ceiling with many verification events', () => {
    const events: PinningEvent[] = Array(20).fill(null).map((_, i) => ({
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now() + i,
    }));
    
    const initial = 0.0;
    const final = applyPinningSequence(initial, events);
    
    expect(final).toBeGreaterThan(0.85); // Should reach high saturation with diminishing returns
    expect(final).toBeLessThanOrEqual(1.0); // But never exceed
  });

  it('should remain bounded regardless of event count', () => {
    const events: PinningEvent[] = Array(100).fill(null).map((_, i) => ({
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now() + i,
    }));
    
    const final = applyPinningSequence(0.0, events);
    
    expect(final).toBeLessThanOrEqual(1.0);
    expect(final).toBeGreaterThanOrEqual(0.0);
  });
});

describe('Weighted Pinning - Boost Calculation', () => {
  it('should calculate boost delta correctly', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() },
    ];
    
    const initial = 0.5;
    const boost = calculatePinningBoost(initial, events);
    
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeCloseTo(0.025, 4); // Use toBeCloseTo for floating point
  });

  it('should return zero boost for empty events', () => {
    const boost = calculatePinningBoost(0.5, []);
    expect(boost).toBe(0);
  });

  it('should return zero boost when already at ceiling', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.VERIFICATION, timestamp: Date.now() },
    ];
    
    const boost = calculatePinningBoost(1.0, events);
    expect(boost).toBe(0);
  });
});

describe('Weighted Pinning - Crystallization Detection', () => {
  it('should detect crystallization when saturation exceeds threshold', () => {
    // Start from 0.7 saturation - memory that's already had substantial access
    // 20 verification events from 0.7 should push above 0.95 threshold
    const events: PinningEvent[] = Array(20).fill(null).map((_, i) => ({
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now() + i,
    }));
    
    const canCrystallize = canCrystallizeAfterPinning(0.7, events, 0.95);
    expect(canCrystallize).toBe(true);
  });

  it('should not detect crystallization below threshold', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() },
    ];
    
    const canCrystallize = canCrystallizeAfterPinning(0.5, events, 0.95);
    expect(canCrystallize).toBe(false);
  });

  it('should use default crystallization threshold of 0.95', () => {
    // Start from 0.7 saturation - memory that's already had substantial access
    // 20 verification events from 0.7 should push above 0.95 threshold
    const events: PinningEvent[] = Array(20).fill(null).map((_, i) => ({
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now() + i,
    }));
    
    const canCrystallize = canCrystallizeAfterPinning(0.7, events);
    expect(canCrystallize).toBe(true);
  });
});

describe('Weighted Pinning - Effectiveness Comparison', () => {
  it('should show verification is most effective', () => {
    const comparison = comparePinningEffectiveness(0.5);
    
    expect(comparison[PinningEventKind.VERIFICATION]).toBeGreaterThan(
      comparison[PinningEventKind.CORROBORATION]
    );
    expect(comparison[PinningEventKind.CORROBORATION]).toBeGreaterThan(
      comparison[PinningEventKind.ORDINARY_ACCESS]
    );
  });

  it('should return positive deltas for all event kinds', () => {
    const comparison = comparePinningEffectiveness(0.5);
    
    expect(comparison[PinningEventKind.ORDINARY_ACCESS]).toBeGreaterThan(0);
    expect(comparison[PinningEventKind.CORROBORATION]).toBeGreaterThan(0);
    expect(comparison[PinningEventKind.VERIFICATION]).toBeGreaterThan(0);
  });

  it('should show diminishing effectiveness near ceiling', () => {
    const lowSat = comparePinningEffectiveness(0.1);
    const highSat = comparePinningEffectiveness(0.9);
    
    expect(lowSat[PinningEventKind.VERIFICATION]).toBeGreaterThan(
      highSat[PinningEventKind.VERIFICATION]
    );
  });
});

describe('Weighted Pinning - Weight Inspection', () => {
  it('should expose default weights for inspection', () => {
    const weights = inspectPinningWeights();
    
    expect(weights.ordinaryAccess).toBe(0.05);
    expect(weights.corroboration).toBe(0.15);
    expect(weights.verification).toBe(0.30);
    expect(weights.ceiling).toBe(1.0);
  });

  it('should expose custom weights for inspection', () => {
    const customParams: PinningParameters = {
      ...DEFAULT_PINNING_PARAMS,
      ordinaryAccess: 0.10,
      corroboration: 0.25,
      verification: 0.50,
    };
    
    const weights = inspectPinningWeights(customParams);
    
    expect(weights.ordinaryAccess).toBe(0.10);
    expect(weights.corroboration).toBe(0.25);
    expect(weights.verification).toBe(0.50);
  });

  it('should return only weight fields, not other params', () => {
    const weights = inspectPinningWeights();
    
    expect(weights).toHaveProperty('ordinaryAccess');
    expect(weights).toHaveProperty('corroboration');
    expect(weights).toHaveProperty('verification');
    expect(weights).toHaveProperty('ceiling');
    expect(weights).not.toHaveProperty('diminishingFactor');
  });
});

describe('Weighted Pinning - Acceptance Criteria Verification', () => {
  it('AC1: Pinning events carry differentiated weights', () => {
    const ordinary = getPinningWeight(PinningEventKind.ORDINARY_ACCESS);
    const corroboration = getPinningWeight(PinningEventKind.CORROBORATION);
    const verification = getPinningWeight(PinningEventKind.VERIFICATION);
    
    // All weights are distinct
    expect(ordinary).not.toBe(corroboration);
    expect(corroboration).not.toBe(verification);
    expect(verification).not.toBe(ordinary);
    
    // Weights are explicit and inspectable
    const weights = inspectPinningWeights();
    expect(weights.ordinaryAccess).toBe(ordinary);
    expect(weights.corroboration).toBe(corroboration);
    expect(weights.verification).toBe(verification);
  });

  it('AC2: Verification pins memory faster than ordinary access', () => {
    const events: PinningEvent[] = [
      { kind: PinningEventKind.ORDINARY_ACCESS, timestamp: Date.now() },
    ];
    const verificationEvents: PinningEvent[] = [
      { kind: PinningEventKind.VERIFICATION, timestamp: Date.now() },
    ];
    
    const initial = 0.5;
    const afterOrdinary = applyPinningSequence(initial, events);
    const afterVerification = applyPinningSequence(initial, verificationEvents);
    
    const ordinaryDelta = afterOrdinary - initial;
    const verificationDelta = afterVerification - initial;
    
    expect(verificationDelta).toBeGreaterThan(ordinaryDelta);
    expect(verificationDelta / ordinaryDelta).toBeCloseTo(6.0, 1); // 0.30 / 0.05 = 6x
  });

  it('AC3: Weighting remains bounded and testable', () => {
    // Test boundedness: many events should not exceed ceiling
    const manyEvents: PinningEvent[] = Array(100).fill(null).map((_, i) => ({
      kind: PinningEventKind.VERIFICATION,
      timestamp: Date.now() + i,
    }));
    
    const final = applyPinningSequence(0.0, manyEvents);
    expect(final).toBeLessThanOrEqual(1.0);
    
    // Test determinism: same inputs produce same outputs
    const run1 = applyPinningSequence(0.5, manyEvents);
    const run2 = applyPinningSequence(0.5, manyEvents);
    expect(run1).toBe(run2);
    
    // Test inspectability: weights are queryable
    const weights = inspectPinningWeights();
    expect(typeof weights.verification).toBe('number');
    expect(weights.verification).toBeGreaterThan(0);
    expect(weights.verification).toBeLessThanOrEqual(1.0);
  });
});
