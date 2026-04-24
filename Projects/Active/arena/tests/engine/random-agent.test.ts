/**
 * RandomAgent — Plan D v2 RoundPlan emission + determinism tests
 */

import { describe, it, expect } from 'bun:test';
import { RandomAgent } from '../../src/agents/random';
import { validateRoundPlan } from '../../src/gateway/validator';
import type { MatchState, HexCell, Unit, AgentRoundBudget } from '../../src/shared/types';
import { newBudget } from '../../src/engine/round-state';

function makeCell(q: number, r: number, s: number, unit?: Unit): HexCell {
  return { position: { q, r, s }, terrain: 'plain', unit };
}

function makeState(units: Unit[], visible: HexCell[]): MatchState {
  return { units, visible, turn: 1, score: { a: 0, b: 0 }, deadline: Date.now() + 5000, roundCap: 48 };
}

function makeUnit(id: string, owner: 'A' | 'B', q: number, r: number): Unit {
  return { id, owner, position: { q, r, s: -q - r }, type: 'infantry', strength: 1, hp: 1, weight: 2 };
}

function plans(agent: RandomAgent, state: MatchState, budget: AgentRoundBudget, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(agent.getRoundPlan(state, budget));
  return out;
}

describe('RandomAgent', () => {
  const myUnit = makeUnit('u1', 'A', 3, 3);
  const N1 = makeCell(4, 3, -7);
  const N2 = makeCell(3, 4, -7);
  const N3 = makeCell(3, 2, -5);

  function coreState(): MatchState {
    return makeState([myUnit], [makeCell(3, 3, -6, myUnit), N1, N2, N3]);
  }

  describe('plans pass validator', () => {
    it('100 plans from single agent pass validateRoundPlan', () => {
      const agent = new RandomAgent('test-agent', 'seed-for-100');
      const state = coreState();
      const budget = newBudget();
      for (const plan of plans(agent, state, budget, 100)) {
        expect(validateRoundPlan(plan, 'A', state, budget).ok).toBe(true);
      }
    });

    it('identical seed ⇒ identical plan sequence', () => {
      const seed = 'determinism-test-seed';
      const a1 = new RandomAgent('agent-1', seed);
      const a2 = new RandomAgent('agent-2', seed);
      const state = coreState();
      const budget = newBudget();
      const s1 = plans(a1, state, budget, 100);
      const s2 = plans(a2, state, budget, 100);
      expect(s1).toEqual(s2);
    });

    it('different seeds ⇒ different plan sequences', () => {
      const a = new RandomAgent('agent-A', 'seed-alpha');
      const b = new RandomAgent('agent-B', 'seed-beta');
      const state = coreState();
      const budget = newBudget();
      const sa = plans(a, state, budget, 100);
      const sb = plans(b, state, budget, 100);
      const allSame = sa.every((p, i) => JSON.stringify(p) === JSON.stringify(sb[i]));
      expect(allSame).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('plans a pass-shape RoundPlan when no units owned', () => {
      const agent = new RandomAgent('empty-agent', 'no-units-seed');
      const state = makeState([], []);
      const plan = agent.getRoundPlan(state, newBudget());
      expect(plan.freeMove).toBeUndefined();
      expect(plan.freeAction).toBeUndefined();
      expect(plan.extras).toEqual([]);
    });
  });
});
