// Budget Tracker Tests
// task-040-budget-tests | phase C

import { describe, it, expect } from 'bun:test';
import { BudgetTracker } from '../../src/gateway/budget';

describe('BudgetTracker', () => {
  describe('record', () => {
    it('accumulates totalMs', () => {
      const tracker = new BudgetTracker();
      tracker.record(50000);
      expect(tracker.totalMs).toBe(50000);
      tracker.record(30000);
      expect(tracker.totalMs).toBe(80000);
    });
  });

  describe('recordInvalid', () => {
    it('increments invalidCount', () => {
      const tracker = new BudgetTracker();
      tracker.recordInvalid();
      expect(tracker.invalidCount).toBe(1);
      tracker.recordInvalid();
      tracker.recordInvalid();
      expect(tracker.invalidCount).toBe(3);
    });
  });

  describe('recordUnanswered', () => {
    it('increments unansweredTurns', () => {
      const tracker = new BudgetTracker();
      tracker.recordUnanswered();
      expect(tracker.unansweredTurns).toBe(1);
    });
  });

  describe('isExceeded — totalMs threshold', () => {
    it('returns exceeded=false when totalMs below 120000', () => {
      const tracker = new BudgetTracker();
      tracker.record(120000);
      expect(tracker.isExceeded()).toEqual({ exceeded: false });
    });

    it('returns exceeded=true with correct reason when totalMs exceeds 120000', () => {
      const tracker = new BudgetTracker();
      tracker.record(120001);
      const result = tracker.isExceeded();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('totalMs 120001 exceeds limit 120000');
    });

    it('triggers on totalMs exactly at boundary', () => {
      const tracker = new BudgetTracker();
      tracker.record(120001);
      expect(tracker.isExceeded().exceeded).toBe(true);
    });
  });

  describe('isExceeded — invalidCount threshold', () => {
    it('returns exceeded=false when invalidCount below 10', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 10; i++) tracker.recordInvalid();
      expect(tracker.isExceeded()).toEqual({ exceeded: false });
    });

    it('returns exceeded=true with correct reason when invalidCount exceeds 10', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 11; i++) tracker.recordInvalid();
      const result = tracker.isExceeded();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('invalidCount 11 exceeds limit 10');
    });

    it('triggers on invalidCount exactly at boundary', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 11; i++) tracker.recordInvalid();
      expect(tracker.isExceeded().exceeded).toBe(true);
    });
  });

  describe('isExceeded — unansweredTurns threshold', () => {
    it('returns exceeded=false when unansweredTurns below 3', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 3; i++) tracker.recordUnanswered();
      expect(tracker.isExceeded()).toEqual({ exceeded: false });
    });

    it('returns exceeded=true with correct reason when unansweredTurns exceeds 3', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 4; i++) tracker.recordUnanswered();
      const result = tracker.isExceeded();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toBe('unansweredTurns 4 exceeds limit 3');
    });

    it('triggers on unansweredTurns exactly at boundary', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 4; i++) tracker.recordUnanswered();
      expect(tracker.isExceeded().exceeded).toBe(true);
    });
  });

  describe('isExceeded — priority', () => {
    it('reports totalMs reason first when multiple thresholds exceeded', () => {
      const tracker = new BudgetTracker();
      tracker.record(200000); // exceeds totalMs
      for (let i = 0; i < 15; i++) tracker.recordInvalid(); // exceeds invalidCount
      for (let i = 0; i < 5; i++) tracker.recordUnanswered(); // exceeds unansweredTurns
      const result = tracker.isExceeded();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain('totalMs');
    });

    it('reports invalidCount reason when only invalidCount exceeded', () => {
      const tracker = new BudgetTracker();
      for (let i = 0; i < 15; i++) tracker.recordInvalid();
      const result = tracker.isExceeded();
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain('invalidCount');
    });
  });

  describe('isExceeded — no thresholds exceeded', () => {
    it('returns exceeded=false with no reason when all below thresholds', () => {
      const tracker = new BudgetTracker();
      tracker.record(50000);
      tracker.recordInvalid();
      tracker.recordUnanswered();
      const result = tracker.isExceeded();
      expect(result.exceeded).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });
});