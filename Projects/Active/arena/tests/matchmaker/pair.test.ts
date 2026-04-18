import { describe, it, expect } from 'bun:test';
import { findPair } from '../../src/matchmaker/pair';
import type { MatchQueue, PairingCriteria, MatchEntry } from '../../src/matchmaker/types';

function makeEntry(id: string, elo: number, joinedAt = Date.now() - 1000): MatchEntry {
  return { id, elo, joinedAt };
}

function makeQueue(entries: MatchEntry[]): MatchQueue {
  return {
    snapshot: () => [...entries],
    enqueue: () => { throw new Error('not implemented'); },
    dequeue: () => { throw new Error('not implemented'); },
  };
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
    const q = makeQueue([makeEntry('agent-a', 1200)]);
    expect(findPair(q, criteria())).toBeNull();
  });

  it('returns pair when two entries are within tolerance', () => {
    const q = makeQueue([
      makeEntry('agent-a', 1200),
      makeEntry('agent-b', 1250),
    ]);
    const result = findPair(q, criteria(100));
    expect(result).not.toBeNull();
    expect([result!.a.id, result!.b.id].sort()).toEqual(['agent-a', 'agent-b']);
  });

  it('returns null when two entries are outside tolerance', () => {
    const q = makeQueue([
      makeEntry('agent-a', 1000),
      makeEntry('agent-b', 1300),
    ]);
    expect(findPair(q, criteria(100))).toBeNull();
  });

  it('picks the oldest valid pair among three entries', () => {
    const t1 = Date.now() - 300;
    const t2 = Date.now() - 200;
    const t3 = Date.now() - 100;
    const entries = [
      makeEntry('oldest', 1200, t1),
      makeEntry('middle', 1205, t2),
      makeEntry('newest', 1208, t3),
    ];
    const q = makeQueue(entries);
    const result = findPair(q, criteria(100));
    expect(result).not.toBeNull();
    // Should pair the two oldest within tolerance (oldest + middle)
    expect(result!.a.id).toBe('oldest');
    expect(result!.b.id).toBe('middle');
  });
});