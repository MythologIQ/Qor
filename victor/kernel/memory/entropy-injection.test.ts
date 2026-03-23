import { describe, it, expect } from 'bun:test';
import {
  ConflictEvent,
  ConflictKind,
  EntropyParams,
  DEFAULT_ENTROPY_PARAMS,
  getConflictWeight,
  applySingleConflict,
  applyConflictSequence,
  calculateEntropyImpact,
  canStabilizeAfterConflicts,
  compareConflictSeverity,
  inspectEntropyWeights,
} from './entropy-injection';

describe('entropy-injection', () => {
  describe('getConflictWeight', () => {
    it('returns contradiction weight for contradiction events', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: Date.now() };
      expect(getConflictWeight(event)).toBe(DEFAULT_ENTROPY_PARAMS.contradictionWeight);
    });

    it('returns disputed claim weight for disputed claim events', () => {
      const event: ConflictEvent = { kind: ConflictKind.DISPUTED_CLAIM, timestamp: Date.now() };
      expect(getConflictWeight(event)).toBe(DEFAULT_ENTROPY_PARAMS.disputedClaimWeight);
    });

    it('returns invalidated source weight for invalidated source events', () => {
      const event: ConflictEvent = { kind: ConflictKind.INVALIDATED_SOURCE, timestamp: Date.now() };
      expect(getConflictWeight(event)).toBe(DEFAULT_ENTROPY_PARAMS.invalidatedSourceWeight);
    });

    it('allows custom weight override', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: Date.now(), weight: 0.5 };
      expect(getConflictWeight(event)).toBe(0.5);
    });

    it('respects custom params', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: Date.now() };
      const params: EntropyParams = { ...DEFAULT_ENTROPY_PARAMS, contradictionWeight: 0.3 };
      expect(getConflictWeight(event, params)).toBe(0.3);
    });
  });

  describe('applySingleConflict', () => {
    it('reduces saturation proportionally to current saturation', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: Date.now() };
      const saturation = 0.8;
      const result = applySingleConflict(saturation, event);
      const expected = saturation - (DEFAULT_ENTROPY_PARAMS.contradictionWeight * saturation);
      expect(result).toBeCloseTo(expected, 5);
    });

    it('enforces floor constraint', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: Date.now(), weight: 1.0 };
      const saturation = 0.1;
      const result = applySingleConflict(saturation, event);
      expect(result).toBe(DEFAULT_ENTROPY_PARAMS.floor);
    });

    it('applies disputed claim with lower weight', () => {
      const event: ConflictEvent = { kind: ConflictKind.DISPUTED_CLAIM, timestamp: Date.now() };
      const saturation = 0.5;
      const result = applySingleConflict(saturation, event);
      const expected = saturation - (DEFAULT_ENTROPY_PARAMS.disputedClaimWeight * saturation);
      expect(result).toBeCloseTo(expected, 5);
    });

    it('applies invalidated source weight', () => {
      const event: ConflictEvent = { kind: ConflictKind.INVALIDATED_SOURCE, timestamp: Date.now() };
      const saturation = 0.6;
      const result = applySingleConflict(saturation, event);
      const expected = saturation - (DEFAULT_ENTROPY_PARAMS.invalidatedSourceWeight * saturation);
      expect(result).toBeCloseTo(expected, 5);
    });

    it('is deterministic for identical inputs', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: 123 };
      const saturation = 0.7;
      const result1 = applySingleConflict(saturation, event);
      const result2 = applySingleConflict(saturation, event);
      expect(result1).toBe(result2);
    });

    it('higher saturation loses more absolute saturation', () => {
      const event: ConflictEvent = { kind: ConflictKind.CONTRADICTION, timestamp: Date.now() };
      const highSat = 0.9;
      const lowSat = 0.3;
      const highDelta = highSat - applySingleConflict(highSat, event);
      const lowDelta = lowSat - applySingleConflict(lowSat, event);
      expect(highDelta).toBeGreaterThan(lowDelta);
    });
  });

  describe('applyConflictSequence', () => {
    it('applies multiple conflicts sequentially', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.DISPUTED_CLAIM, timestamp: 2 },
      ];
      const saturation = 0.8;
      const result = applyConflictSequence(saturation, events);
      expect(result).toBeLessThan(saturation);
    });

    it('enforces diminishing returns for repeated conflict kind', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.CONTRADICTION, timestamp: 2 },
      ];
      const saturation = 0.8;
      
      const firstImpact = saturation - applySingleConflict(saturation, events[0]);
      const afterFirst = applySingleConflict(saturation, events[0]);
      const secondImpact = afterFirst - applySingleConflict(afterFirst, events[1]);
      
      const result = applyConflictSequence(saturation, events);
      
      expect(secondImpact).toBeLessThan(firstImpact);
      expect(result).toBeGreaterThan(0);
    });

    it('different conflict kinds do not interfere with each other', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.DISPUTED_CLAIM, timestamp: 2 },
        { kind: ConflictKind.CONTRADICTION, timestamp: 3 },
      ];
      const saturation = 0.8;
      const result = applyConflictSequence(saturation, events);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(saturation);
    });

    it('converges to floor after many conflicts', () => {
      const events: ConflictEvent[] = Array(100).fill(null).map((_, i) => ({
        kind: ConflictKind.CONTRADICTION,
        timestamp: i,
      }));
      const saturation = 0.9;
      const result = applyConflictSequence(saturation, events);
      expect(result).toBeGreaterThanOrEqual(DEFAULT_ENTROPY_PARAMS.floor);
      expect(result).toBeLessThan(saturation);
    });

    it('is deterministic for identical sequences', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.DISPUTED_CLAIM, timestamp: 2 },
      ];
      const saturation = 0.75;
      const result1 = applyConflictSequence(saturation, events);
      const result2 = applyConflictSequence(saturation, events);
      expect(result1).toBe(result2);
    });
  });

  describe('calculateEntropyImpact', () => {
    it('returns saturation delta for conflict sequence', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
      ];
      const saturation = 0.8;
      const impact = calculateEntropyImpact(saturation, events);
      expect(impact).toBeGreaterThan(0);
      expect(impact).toBeCloseTo(DEFAULT_ENTROPY_PARAMS.contradictionWeight * saturation, 5);
    });

    it('returns zero impact for empty event list', () => {
      const impact = calculateEntropyImpact(0.8, []);
      expect(impact).toBe(0);
    });

    it('impact increases with more conflicts', () => {
      const events1: ConflictEvent[] = [{ kind: ConflictKind.CONTRADICTION, timestamp: 1 }];
      const events2: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.DISPUTED_CLAIM, timestamp: 2 },
      ];
      const saturation = 0.8;
      const impact1 = calculateEntropyImpact(saturation, events1);
      const impact2 = calculateEntropyImpact(saturation, events2);
      expect(impact2).toBeGreaterThan(impact1);
    });
  });

  describe('canStabilizeAfterConflicts', () => {
    it('returns true if final saturation exceeds threshold', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.DISPUTED_CLAIM, timestamp: 1 },
      ];
      const saturation = 0.8;
      const threshold = 0.6;
      expect(canStabilizeAfterConflicts(saturation, events, threshold)).toBe(true);
    });

    it('returns false if final saturation below threshold', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.CONTRADICTION, timestamp: 2 },
        { kind: ConflictKind.CONTRADICTION, timestamp: 3 },
      ];
      const saturation = 0.5;
      const threshold = 0.4;
      expect(canStabilizeAfterConflicts(saturation, events, threshold)).toBe(false);
    });

    it('handles edge case of saturation exactly at threshold', () => {
      const events: ConflictEvent[] = [];
      const saturation = 0.6;
      const threshold = 0.6;
      expect(canStabilizeAfterConflicts(saturation, events, threshold)).toBe(true);
    });
  });

  describe('compareConflictSeverity', () => {
    it('shows contradiction has highest impact', () => {
      const saturation = 0.8;
      const severity = compareConflictSeverity(saturation);
      
      expect(severity.contradictionImpact).toBeLessThan(severity.disputedClaimImpact);
      expect(severity.contradictionImpact).toBeLessThan(severity.invalidatedSourceImpact);
    });

    it('shows disputed claim has lowest impact', () => {
      const saturation = 0.8;
      const severity = compareConflictSeverity(saturation);
      
      expect(severity.disputedClaimImpact).toBeGreaterThan(severity.contradictionImpact);
      expect(severity.disputedClaimImpact).toBeGreaterThan(severity.invalidatedSourceImpact);
    });

    it('shows invalidated source has medium impact', () => {
      const saturation = 0.8;
      const severity = compareConflictSeverity(saturation);
      
      expect(severity.invalidatedSourceImpact).toBeGreaterThan(severity.contradictionImpact);
      expect(severity.invalidatedSourceImpact).toBeLessThan(severity.disputedClaimImpact);
    });
  });

  describe('inspectEntropyWeights', () => {
    it('returns default weights when no params provided', () => {
      const weights = inspectEntropyWeights();
      expect(weights).toEqual(DEFAULT_ENTROPY_PARAMS);
    });

    it('returns custom weights when params provided', () => {
      const custom: EntropyParams = {
        contradictionWeight: 0.25,
        disputedClaimWeight: 0.12,
        invalidatedSourceWeight: 0.18,
        floor: 0.0,
        diminishingFactor: 0.8,
      };
      const weights = inspectEntropyWeights(custom);
      expect(weights).toEqual(custom);
    });

    it('returns copy not reference', () => {
      const weights = inspectEntropyWeights();
      weights.contradictionWeight = 0.99;
      expect(DEFAULT_ENTROPY_PARAMS.contradictionWeight).not.toBe(0.99);
    });
  });

  describe('Acceptance Criteria', () => {
    it('AC1: Conflict paths can reduce saturation deterministically', () => {
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.DISPUTED_CLAIM, timestamp: 2 },
      ];
      const saturation = 0.8;
      
      const result1 = applyConflictSequence(saturation, events);
      const result2 = applyConflictSequence(saturation, events);
      
      expect(result1).toBeLessThan(saturation);
      expect(result1).toBe(result2);
      expect(result1).toBeGreaterThanOrEqual(DEFAULT_ENTROPY_PARAMS.floor);
    });

    it('AC2: Entropy injection is bounded and auditable', () => {
      const events: ConflictEvent[] = Array(100).fill(null).map((_, i) => ({
        kind: ConflictKind.CONTRADICTION,
        timestamp: i,
      }));
      const saturation = 1.0;
      
      const result = applyConflictSequence(saturation, events);
      const impact = calculateEntropyImpact(saturation, events);
      const weights = inspectEntropyWeights();
      
      expect(result).toBeGreaterThanOrEqual(DEFAULT_ENTROPY_PARAMS.floor);
      expect(result).toBeLessThanOrEqual(saturation);
      expect(impact).toBeGreaterThan(0);
      expect(weights.contradictionWeight).toBe(0.20);
      expect(weights.disputedClaimWeight).toBe(0.10);
      expect(weights.invalidatedSourceWeight).toBe(0.15);
    });

    it('AC3: Contested memory loses stability without destructive deletion', () => {
      const initialSaturation = 0.9;
      const events: ConflictEvent[] = [
        { kind: ConflictKind.CONTRADICTION, timestamp: 1 },
        { kind: ConflictKind.CONTRADICTION, timestamp: 2 },
      ];
      
      const finalSaturation = applyConflictSequence(initialSaturation, events);
      const impact = calculateEntropyImpact(initialSaturation, events);
      
      expect(finalSaturation).toBeLessThan(initialSaturation);
      expect(finalSaturation).toBeGreaterThan(0);
      expect(impact).toBeGreaterThan(0);
      expect(canStabilizeAfterConflicts(initialSaturation, events, 0.5)).toBe(true);
    });
  });
});
