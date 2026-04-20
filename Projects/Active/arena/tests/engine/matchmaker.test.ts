import { describe, it, beforeEach, expect } from 'bun:test';
import { enqueue, start, getMatch, clear } from '../../src/orchestrator/matchmaker.ts';

describe('matchmaker', () => {
  beforeEach(() => {
    clear();
  });

  it('1 enqueued → no match', () => {
    enqueue('agent-alice');
    const result = start();
    expect(result).toBeNull();
  });

  it('2 enqueued → match', () => {
    enqueue('agent-alice');
    enqueue('agent-bob');
    const result = start();
    expect(result).not.toBeNull();
    expect(result!.type).toBe('match_created');
    expect(result!.agentA).toBe('agent-alice');
    expect(result!.agentB).toBe('agent-bob');
    expect(result!.matchId).toMatch(/^match-\d+$/);
    expect(result!.matchState).toBeDefined();
  });

  it('3 enqueued → one pair + one waiting', () => {
    enqueue('agent-alice');
    enqueue('agent-bob');
    enqueue('agent-carol');
    const first = start();
    expect(first).not.toBeNull();
    expect(first!.agentA).toBe('agent-alice');
    expect(first!.agentB).toBe('agent-bob');
    // Carol is still waiting; start() with 1 remaining returns null
    const second = start();
    expect(second).toBeNull();
  });
});