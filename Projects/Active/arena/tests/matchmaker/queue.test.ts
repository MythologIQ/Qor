import { describe, expect, test } from 'bun:test';
import { MatchQueue } from '../../src/matchmaker/queue';
import type { QueueEntry } from '../../src/matchmaker/types';

function makeEntry(operatorId: number, handle = `op${operatorId}`, elo = 1000): QueueEntry {
  return { operatorId, handle, elo, enqueuedAt: Date.now() };
}

function seedEntry(operatorId: number, handle = `op${operatorId}`, elo = 1000, offsetMs = 0): QueueEntry {
  return { operatorId, handle, elo, enqueuedAt: Date.now() - offsetMs };
}

describe('MatchQueue', () => {
  describe('enqueue increments size', () => {
    test('empty queue has size 0', () => {
      const q = new MatchQueue();
      expect(q.size()).toBe(0);
    });

    test('enqueue one entry increments size to 1', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1));
      expect(q.size()).toBe(1);
    });

    test('enqueue three entries increments size to 3', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1));
      q.enqueue(makeEntry(2));
      q.enqueue(makeEntry(3));
      expect(q.size()).toBe(3);
    });
  });

  describe('duplicate operator enqueue is idempotent', () => {
    test('re-enqueueing same operatorId replaces entry, size stays 1', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1, 'op1', 1000));
      q.enqueue(makeEntry(1, 'op1-updated', 1050));
      expect(q.size()).toBe(1);
      const snap = q.snapshot();
      expect(snap).toHaveLength(1);
      expect(snap[0].operatorId).toBe(1);
      expect(snap[0].elo).toBe(1050);
    });

    test('re-enqueueing different operatorId increments size to 2', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1));
      q.enqueue(makeEntry(2));
      q.enqueue(makeEntry(1));
      expect(q.size()).toBe(2);
    });
  });

  describe('dequeue returns true/false', () => {
    test('dequeue non-existent operatorId returns false', () => {
      const q = new MatchQueue();
      expect(q.dequeue(99)).toBe(false);
    });

    test('dequeue existing operatorId returns true and removes entry', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1));
      expect(q.dequeue(1)).toBe(true);
      expect(q.size()).toBe(0);
    });

    test('dequeue already-removed operatorId returns false', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1));
      q.dequeue(1);
      expect(q.dequeue(1)).toBe(false);
    });
  });

  describe('snapshot orders by enqueuedAt asc', () => {
    test('snapshot returns empty array for empty queue', () => {
      const q = new MatchQueue();
      expect(q.snapshot()).toHaveLength(0);
    });

    test('single entry snapshot returns that entry', () => {
      const q = new MatchQueue();
      q.enqueue(makeEntry(1));
      expect(q.snapshot()).toHaveLength(1);
    });

    test('snapshot orders entries by enqueuedAt ascending', () => {
      const q = new MatchQueue();
      // Insert out of temporal order
      q.enqueue(seedEntry(3, 'op3', 1000, 30)); // earliest
      q.enqueue(seedEntry(1, 'op1', 1000, 10)); // latest
      q.enqueue(seedEntry(2, 'op2', 1000, 20)); // middle

      const snap = q.snapshot();
      expect(snap).toHaveLength(3);
      expect(snap[0].operatorId).toBe(3);
      expect(snap[1].operatorId).toBe(2);
      expect(snap[2].operatorId).toBe(1);
    });
  });
});