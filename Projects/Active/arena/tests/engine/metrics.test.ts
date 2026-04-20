import { describe, it, expect, beforeEach } from 'bun:test';
import { Metrics } from '../../src/orchestrator/metrics';

describe('Metrics', () => {
  let metrics: Metrics;

  beforeEach(() => {
    metrics = new Metrics();
  });

  describe('averaging', () => {
    it('returns 0 avgDecisionMs when no actions recorded', () => {
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.avgDecisionMs).toBe(0);
    });

    it('calculates average decision time correctly', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordAction('B', 200, true);
      metrics.recordAction('A', 300, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.avgDecisionMs).toBe(200);
    });

    it('rounds average to nearest integer', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordAction('B', 101, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.avgDecisionMs).toBe(101);
    });

    it('excludes invalid actions from averaging', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordAction('B', 200, false);
      metrics.recordAction('A', 300, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.avgDecisionMs).toBe(200);
    });
  });

  describe('invalid counting', () => {
    it('returns 0 invalidActions when all actions valid', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordAction('B', 200, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.invalidActions).toBe(0);
    });

    it('counts invalid actions correctly', () => {
      metrics.recordAction('A', 100, false);
      metrics.recordAction('B', 200, true);
      metrics.recordAction('A', 300, false);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.invalidActions).toBe(2);
    });

    it('totalActions includes invalid actions', () => {
      metrics.recordAction('A', 100, false);
      metrics.recordAction('B', 200, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.totalActions).toBe(2);
    });

    it('tracks multiple invalid actions across sides', () => {
      metrics.recordAction('A', 100, false);
      metrics.recordAction('B', 200, false);
      metrics.recordAction('A', 300, false);
      metrics.recordAction('B', 400, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.invalidActions).toBe(3);
    });
  });

  describe('duration', () => {
    it('returns 0 durationMs when no turn recorded', () => {
      const result = metrics.finalize();
      expect(result.durationMs).toBe(0);
    });

    it('returns 0 durationMs when no action recorded', () => {
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.durationMs).toBe(0);
    });

    it('calculates duration from first action to turn record', async () => {
      metrics.recordAction('A', 50, true);
      await new Promise(resolve => setTimeout(resolve, 10));
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('duration does not include time before first action', () => {
      metrics = new Metrics();
      const before = Date.now();
      metrics.recordAction('A', 50, true);
      const after = Date.now();
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.durationMs).toBeLessThanOrEqual(after - before);
    });
  });

  describe('turnsPlayed', () => {
    it('counts only valid actions as turns', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordAction('B', 200, true);
      metrics.recordAction('A', 300, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.turnsPlayed).toBe(3);
    });

    it('invalid actions do not count as turns', () => {
      metrics.recordAction('A', 100, false);
      metrics.recordAction('B', 200, true);
      metrics.recordAction('A', 300, false);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result.turnsPlayed).toBe(1);
    });
  });

  describe('finalize', () => {
    it('returns complete MatchMetrics structure', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordTurn();
      const result = metrics.finalize();
      expect(result).toHaveProperty('totalActions');
      expect(result).toHaveProperty('avgDecisionMs');
      expect(result).toHaveProperty('invalidActions');
      expect(result).toHaveProperty('turnsPlayed');
      expect(result).toHaveProperty('durationMs');
    });

    it('finalize can be called multiple times', () => {
      metrics.recordAction('A', 100, true);
      metrics.recordTurn();
      const r1 = metrics.finalize();
      const r2 = metrics.finalize();
      expect(r1.totalActions).toBe(r2.totalActions);
    });
  });
});