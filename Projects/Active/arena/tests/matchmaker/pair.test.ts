import { describe, it, expect } from 'bun:test';
import { findPair } from '../../src/matchmaker/pair';
import { MatchQueue } from '../../src/matchmaker/queue';
import type { PairingCriteria, QueueEntry } from '../../src/matchmaker/types';

function makeEntry(operatorId: number, elo: number, enqueuedAt = Date.now() - 1000): QueueEntry {
  return { operatorId, handle: `op-${operatorId}`, elo, enqueuedAt };
}

function makeQueue(entries: QueueEntry[]): MatchQueue {
  const queue = new MatchQueue();
  for (const entry of entries) {
    queue.enqueue(entry);
  }
  return queue;
}

function criteria(eloTolerance = 100): PairingCriteria {
  return { eloTolerance };
}

describe('findPair', () => {
  it('returns null for empty queue', () => {
    const q = makeQueue([]);
    expect(findPair(q, criteria())).toBeNull();
  });

  it('returns null for single entry', () => {
    const q = makeQueue([makeEntry(1, 1200)]);
    expect(findPair(q, criteria())).toBeNull();
  });

  it('returns pair when two entries are within tolerance', () => {
    const q = makeQueue([
      makeEntry(1, 1200),
      makeEntry(2, 1250),
    ]);
    const result = findPair(q, criteria(100));
    expect(result).not.toBeNull();
    expect([result!.a.operatorId, result!.b.operatorId].sort()).toEqual([1, 2]);
  });

  it('returns null when two entries are outside tolerance', () => {
    const q = makeQueue([
      makeEntry(1, 1000),
      makeEntry(2, 1300),
    ]);
    expect(findPair(q, criteria(100))).toBeNull();
  });

  it('picks the oldest valid pair among three entries', () => {
    const t1 = Date.now() - 300;
    const t2 = Date.now() - 200;
    const t3 = Date.now() - 100;
    const entries = [
      makeEntry(1, 1200, t1),
      makeEntry(2, 1205, t2),
      makeEntry(3, 1208, t3),
    ];
    const q = makeQueue(entries);
    const result = findPair(q, criteria(100));
    expect(result).not.toBeNull();
    // Should pair the two oldest within tolerance (oldest + middle)
    expect(result!.a.operatorId).toBe(1);
    expect(result!.b.operatorId).toBe(2);
  });
});
