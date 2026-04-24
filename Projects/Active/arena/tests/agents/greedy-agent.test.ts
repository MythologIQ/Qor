/**
 * GreedyAgent — Plan D v2 RoundPlan emission tests
 */

import { describe, it, expect } from 'bun:test';
import { GreedyAgent } from '../../src/agents/greedy';
import { validateRoundPlan } from '../../src/gateway/validator';
import type { MatchState, HexCell, Unit, AgentRoundBudget } from '../../src/shared/types';
import { newBudget } from '../../src/engine/round-state';

function makeCell(q: number, r: number, s: number, owner?: 'A' | 'B', hp?: number): HexCell {
  const base: HexCell = { position: { q, r, s }, terrain: 'plain' };
  if (owner && hp !== undefined) {
    const unit: Unit = {
      id: `u_${q}_${r}`, owner, position: base.position,
      type: 'infantry', strength: 1, hp, weight: 2,
    };
    return { ...base, unit };
  }
  return base;
}

function makeUnit(id: string, owner: 'A' | 'B', q: number, r: number, hp = 5): Unit {
  return { id, owner, position: { q, r, s: -q - r }, type: 'infantry', strength: 1, hp, weight: 2 };
}

function makeState(units: Unit[], visible: HexCell[]): MatchState {
  return { units, visible, turn: 1, score: { a: 0, b: 0 }, deadline: Date.now() + 5000, roundCap: 48 };
}

describe('GreedyAgent — RoundPlan emission', () => {
  it('emits a valid RoundPlan with no enemies', () => {
    const myUnit = makeUnit('u1', 'A', 0, 0);
    const visible: HexCell[] = [
      makeCell(0, 0, 0), makeCell(1, -1, 0), makeCell(1, 0, -1),
      makeCell(0, 1, -1), makeCell(-1, 1, 0), makeCell(-1, 0, 1),
      makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit], visible);
    const agent = new GreedyAgent('test-greedy');
    const budget: AgentRoundBudget = newBudget();
    const plan = agent.getRoundPlan(state, budget);
    const result = validateRoundPlan(plan, 'A', state, budget);
    expect(result.ok).toBe(true);
  });

  it('100 plans all pass validateRoundPlan', () => {
    const myUnit = makeUnit('u1', 'A', 0, 0, 3);
    const enemyUnit = makeUnit('e1', 'B', 1, -1, 2);
    const visible: HexCell[] = [
      makeCell(0, 0, 0), makeCell(1, -1, 0), makeCell(1, 0, -1),
      makeCell(0, 1, -1), makeCell(-1, 1, 0), makeCell(-1, 0, 1),
      makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit, enemyUnit], visible);
    const agent = new GreedyAgent('test-greedy');
    const budget: AgentRoundBudget = newBudget();
    for (let i = 0; i < 100; i++) {
      const plan = agent.getRoundPlan(state, budget);
      expect(validateRoundPlan(plan, 'A', state, budget).ok).toBe(true);
    }
  });

  it('produces an identical plan on identical state', () => {
    const myUnit = makeUnit('u1', 'A', 0, 0, 4);
    const visible: HexCell[] = [
      makeCell(0, 0, 0), makeCell(1, -1, 0), makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit], visible);
    const agent = new GreedyAgent('det-test');
    const budget: AgentRoundBudget = newBudget();
    const p1 = agent.getRoundPlan(state, budget);
    const p2 = agent.getRoundPlan(state, budget);
    expect(p1).toEqual(p2);
  });

  it('returns pass-equivalent plan when no units owned', () => {
    const state = makeState([], []);
    const agent = new GreedyAgent('edge-test');
    const plan = agent.getRoundPlan(state, newBudget());
    expect(plan.bid).toBe(0);
    expect(plan.extras).toEqual([]);
    expect(plan.freeMove).toBeUndefined();
    expect(plan.freeAction).toBeUndefined();
  });
});
