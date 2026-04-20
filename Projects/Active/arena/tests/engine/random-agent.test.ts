/**
 * Builder Tick 43 | task-043-random-tests
 * Tests for RandomAgent — seed determinism and validator compliance
 */

import { describe, it, expect } from 'bun:test';
import { RandomAgent } from '../../src/agents/random';
import { validateAction } from '../../src/gateway/validator';
import type { MatchState, HexCell } from '../../src/shared/types';

function makeCell(q: number, r: number, s: number, unit?: MatchState['units'][0]): HexCell {
  return { position: { q, r, s }, terrain: 'plains', unit };
}

function makeState(units: MatchState['units'], visible: HexCell[]): MatchState {
  return { units, visible, turn: 1, phase: 'action' };
}

// Helper: generate 100 decisions and collect results
function generateDecisions(agent: RandomAgent, state: MatchState) {
  const decisions: ReturnType<typeof agent.decide>[] = [];
  for (let i = 0; i < 100; i++) {
    decisions.push(agent.decide(state));
  }
  return decisions;
}

describe('RandomAgent', () => {
  const SIDE_A_OWNER = 'A' as const;
  const SIDE_B_OWNER = 'B' as const;

  // Two fixed board neighbors of (3, 3, -6) within distance-1
  const NEIGHBOR_1 = { q: 4, r: 3, s: -7 };
  const NEIGHBOR_2 = { q: 3, r: 4, s: -7 };
  const NEIGHBOR_3 = { q: 3, r: 2, s: -5 };

  function makeCoreState() {
    const myUnit = { id: 'u1', owner: SIDE_A_OWNER, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY' as const, hp: 1 };
    const visible: HexCell[] = [
      makeCell(3, 3, -6, myUnit),
      makeCell(NEIGHBOR_1.q, NEIGHBOR_1.r, NEIGHBOR_1.s),
      makeCell(NEIGHBOR_2.q, NEIGHBOR_2.r, NEIGHBOR_2.s),
      makeCell(NEIGHBOR_3.q, NEIGHBOR_3.r, NEIGHBOR_3.s),
    ];
    return makeState([myUnit], visible);
  }

  describe('100 decisions all pass validator', () => {
    it('all 100 decisions from single agent pass validateAction', () => {
      const agent = new RandomAgent('test-agent', 'seed-for-100');
      const state = makeCoreState();

      const decisions = generateDecisions(agent, state);
      expect(decisions.length).toBe(100);

      for (let i = 0; i < decisions.length; i++) {
        const result = validateAction(decisions[i], state, SIDE_A_OWNER);
        expect(result.valid).toBe(true);
      }
    });

    it('all 100 decisions from a fresh agent instance pass validateAction', () => {
      const agent1 = new RandomAgent('fresh-agent', 'fresh-seed');
      const agent2 = new RandomAgent('fresh-agent', 'fresh-seed');
      const state = makeCoreState();

      const decisions1 = generateDecisions(agent1, state);
      const decisions2 = generateDecisions(agent2, state);

      for (const action of decisions1) {
        expect(validateAction(action, state, SIDE_A_OWNER).valid).toBe(true);
      }
      for (const action of decisions2) {
        expect(validateAction(action, state, SIDE_A_OWNER).valid).toBe(true);
      }
    });

    it('all 100 decisions pass validator with enemy unit in visible', () => {
      const enemyUnit = { id: 'e1', owner: SIDE_B_OWNER, position: NEIGHBOR_1, type: 'INFANTRY' as const, hp: 1 };
      const myUnit = { id: 'u1', owner: SIDE_A_OWNER, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY' as const, hp: 1 };
      const visible: HexCell[] = [
        makeCell(3, 3, -6, myUnit),
        makeCell(NEIGHBOR_1.q, NEIGHBOR_1.r, NEIGHBOR_1.s, enemyUnit),
        makeCell(NEIGHBOR_2.q, NEIGHBOR_2.r, NEIGHBOR_2.s),
        makeCell(NEIGHBOR_3.q, NEIGHBOR_3.r, NEIGHBOR_3.s),
      ];
      const state = makeState([myUnit, enemyUnit], visible);

      const agent = new RandomAgent('test-agent', 'seed-with-enemy');
      const decisions = generateDecisions(agent, state);

      for (let i = 0; i < decisions.length; i++) {
        const result = validateAction(decisions[i], state, SIDE_A_OWNER);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('seed determinism — same seed produces same sequence', () => {
    it('identical seed produces identical decisions across two instances', () => {
      const seed = 'determinism-test-seed';
      const agent1 = new RandomAgent('agent-1', seed);
      const agent2 = new RandomAgent('agent-2', seed);
      const state = makeCoreState();

      const decisions1 = generateDecisions(agent1, state);
      const decisions2 = generateDecisions(agent2, state);

      expect(decisions1.length).toBe(100);
      expect(decisions2.length).toBe(100);

      for (let i = 0; i < 100; i++) {
        const a = decisions1[i];
        const b = decisions2[i];
        expect(a.type).toBe(b.type);
        expect(a.confidence).toBeCloseTo(b.confidence, 10);
        if (a.from) {
          expect(a.from).toEqual(b.from);
        }
        if (a.to) {
          expect(a.to).toEqual(b.to);
        }
      }
    });

    it('identical seed produces identical decisions across 1000 calls', () => {
      const seed = 'stress-determinism';
      const agent1 = new RandomAgent('stress-1', seed);
      const agent2 = new RandomAgent('stress-2', seed);
      const state = makeCoreState();

      for (let i = 0; i < 1000; i++) {
        const d1 = agent1.decide(state);
        const d2 = agent2.decide(state);
        expect(d1.type).toBe(d2.type);
        expect(d1.confidence).toBeCloseTo(d2.confidence, 10);
        if (d1.from) expect(d1.from).toEqual(d2.from);
        if (d1.to) expect(d1.to).toEqual(d2.to);
      }
    });

    it('different seeds produce different decision sequences', () => {
      const agentA = new RandomAgent('agent-A', 'seed-alpha');
      const agentB = new RandomAgent('agent-B', 'seed-beta');
      const state = makeCoreState();

      const decisionsA = generateDecisions(agentA, state);
      const decisionsB = generateDecisions(agentB, state);

      // At least one decision should differ
      const allSame = decisionsA.every((d, i) => d.type === decisionsB[i].type);
      expect(allSame).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('pass action when no units owned', () => {
      const agent = new RandomAgent('empty-agent', 'no-units-seed');
      const state = makeState([], []);
      const action = agent.decide(state);
      expect(action.type).toBe('pass');
    });

    it('pass action when no visible adjacent cells', () => {
      const myUnit = { id: 'u1', owner: SIDE_A_OWNER, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY' as const, hp: 1 };
      // visible but no distance-1 neighbors (only self visible)
      const visible: HexCell[] = [makeCell(3, 3, -6, myUnit)];
      const state = makeState([myUnit], visible);
      const agent = new RandomAgent('corner-agent', 'no-neighbors-seed');
      const action = agent.decide(state);
      expect(action.type).toBe('pass');
      expect(action.from).toBeDefined();
    });
  });
});