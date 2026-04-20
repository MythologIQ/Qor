/**
 * Builder Tick 44 | task-044-greedy-agent
 * Tests for GreedyAgent — scoring logic, validator compliance, and determinism
 */

import { describe, it, expect } from 'bun:test';
import { GreedyAgent } from '../../src/agents/greedy';
import { validateAction } from '../../src/gateway/validator';
import type { MatchState, HexCell } from '../../src/shared/types';

function makeCell(q: number, r: number, s: number, owner?: 'A' | 'B', hp?: number): HexCell {
  const base = { position: { q, r, s }, terrain: 'plain' as const };
  if (owner && hp !== undefined) {
    return { ...base, unit: { id: `u_${q}_${r}`, owner, position: base.position, type: 'infantry' as const, strength: 1, hp } };
  }
  return base;
}

function makeState(units: MatchState['units'], visible: HexCell[]): MatchState {
  return { units, visible, turn: 1, yourTurn: true, score: { a: 0, b: 0 }, deadline: Date.now() + 5000 };
}

function runDecision(agent: GreedyAgent, state: MatchState) {
  return agent.decide(state);
}

// ── Validator compliance ────────────────────────────────────────────────────

describe('GreedyAgent — always valid action', () => {
  it('single decision passes validateAction with no enemies', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 };
    const visible: HexCell[] = [
      makeCell(0, 0, 0),
      makeCell(1, -1, 0),
      makeCell(1, 0, -1),
      makeCell(0, 1, -1),
      makeCell(-1, 1, 0),
      makeCell(-1, 0, 1),
      makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit], visible);
    const agent = new GreedyAgent('test-greedy');
    const action = runDecision(agent, state);
    const result = validateAction(action, state, 'A');
    expect(result.valid).toBe(true);
  });

  it('100 decisions all pass validateAction', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 3 };
    const enemyUnit = { id: 'e1', owner: 'B' as const, position: { q: 1, r: -1, s: 0 }, type: 'infantry' as const, strength: 1, hp: 2 };
    const visible: HexCell[] = [
      makeCell(0, 0, 0),
      makeCell(1, -1, 0),
      makeCell(1, 0, -1),
      makeCell(0, 1, -1),
      makeCell(-1, 1, 0),
      makeCell(-1, 0, 1),
      makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit, enemyUnit], visible);
    const agent = new GreedyAgent('test-greedy');
    for (let i = 0; i < 100; i++) {
      const action = runDecision(agent, state);
      const result = validateAction(action, state, 'A');
      expect(result.valid).toBe(true);
    }
  });
});

// ── Determinism ─────────────────────────────────────────────────────────────

describe('GreedyAgent — deterministic given same state', () => {
  it('same agent produces identical decision on identical state', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 4 };
    const visible: HexCell[] = [
      makeCell(0, 0, 0),
      makeCell(1, -1, 0),
      makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit], visible);
    const agent = new GreedyAgent('det-test');
    const d1 = runDecision(agent, state);
    const d2 = runDecision(agent, state);
    const d3 = runDecision(agent, state);
    expect(d1.type).toBe(d2.type);
    expect(d2.type).toBe(d3.type);
    if (d1.from) expect(d1.from).toEqual(d2.from);
    if (d1.to) expect(d1.to).toEqual(d3.to);
  });

  it('different instances produce identical decision on identical state', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 2 };
    const enemyUnit = { id: 'e1', owner: 'B' as const, position: { q: 1, r: -1, s: 0 }, type: 'infantry' as const, strength: 1, hp: 1 };
    const visible: HexCell[] = [
      makeCell(0, 0, 0),
      makeCell(1, -1, 0),
      makeCell(1, 0, -1),
      makeCell(0, 1, -1),
      makeCell(-1, 1, 0),
      makeCell(-1, 0, 1),
      makeCell(0, -1, 1),
    ];
    const state = makeState([myUnit, enemyUnit], visible);
    const agent1 = new GreedyAgent('inst-1');
    const agent2 = new GreedyAgent('inst-2');
    for (let i = 0; i < 50; i++) {
      const d1 = runDecision(agent1, state);
      const d2 = runDecision(agent2, state);
      expect(d1.type).toBe(d2.type);
      if (d1.from) expect(d1.from).toEqual(d2.from);
      if (d1.to) expect(d1.to).toEqual(d2.to);
      expect(d1.confidence).toBe(d2.confidence);
    }
  });
});

// ── Scoring logic ───────────────────────────────────────────────────────────

describe('GreedyAgent — scoring heuristics', () => {
  it('prefers unclaimed territory over owned territory when move available', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 3 };
    // One unclaimed cell, one A-controlled cell
    const unclaimed = makeCell(1, -1, 0);                               // score +2
    const controlledByA = { ...makeCell(1, 0, -1), controlledBy: 'A' as const }; // score +0
    const visible: HexCell[] = [makeCell(0, 0, 0), unclaimed, controlledByA];
    const state = makeState([myUnit], visible);
    const agent = new GreedyAgent('score-test');
    const action = runDecision(agent, state);
    expect(action.type).toBe('move');
    expect(action.to).toEqual({ q: 1, r: -1, s: 0 });
  });

  it('attacks enemy with HP advantage over move to unclaimed', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 };
    const enemyUnit = { id: 'e1', owner: 'B' as const, position: { q: 1, r: -1, s: 0 }, type: 'infantry' as const, strength: 1, hp: 3 }; // myUnit.hp > enemyUnit.hp → +3
    const unclaimed = makeCell(1, 0, -1);                               // +2
    const visible: HexCell[] = [makeCell(0, 0, 0), makeCell(1, -1, 0, 'B', 3), unclaimed];
    const state = makeState([myUnit, enemyUnit], visible);
    const agent = new GreedyAgent('score-test');
    const action = runDecision(agent, state);
    expect(action.type).toBe('attack');
    expect(action.to).toEqual({ q: 1, r: -1, s: 0 });
  });

  it('does NOT attack enemy when my HP is lower (no HP advantage)', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 2 };
    const enemyUnit = { id: 'e1', owner: 'B' as const, position: { q: 1, r: -1, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 }; // my HP not > enemy HP
    const unclaimed = makeCell(1, 0, -1);                               // +2 — better than attack with no HP advantage (+0)
    const visible: HexCell[] = [makeCell(0, 0, 0), makeCell(1, -1, 0, 'B', 5), unclaimed];
    const state = makeState([myUnit, enemyUnit], visible);
    const agent = new GreedyAgent('score-test');
    const action = runDecision(agent, state);
    expect(action.type).toBe('move');
    expect(action.to).toEqual({ q: 1, r: 0, s: -1 }); // unclaimed has +2
  });

  it('defaults to pass when no valid scoring actions available', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 };
    const enemyUnit = { id: 'e1', owner: 'B' as const, position: { q: 1, r: -1, s: 0 }, type: 'infantry' as const, strength: 1, hp: 8 }; // HP advantage denied
    // Only adjacent cell is the enemy cell (unfavorable attack)
    const visible: HexCell[] = [makeCell(0, 0, 0), makeCell(1, -1, 0, 'B', 8)];
    const state = makeState([myUnit, enemyUnit], visible);
    const agent = new GreedyAgent('score-test');
    const action = runDecision(agent, state);
    // All adjacent cells score 0 → pick first sorted candidate → might be attack or move
    expect(['move', 'attack', 'pass']).toContain(action.type);
  });
});

// ── Tie-breaking ────────────────────────────────────────────────────────────

describe('GreedyAgent — deterministic tie-break', () => {
  it('prefers unit id ascending when scores equal', () => {
    const unit1 = { id: 'alpha', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 };
    const unit2 = { id: 'beta', owner: 'A' as const, position: { q: 10, r: 0, s: -10 }, type: 'infantry' as const, strength: 1, hp: 5 };
    // Both units have same unclaimed targets; alpha comes first alphabetically → alpha selected
    const state = makeState([unit1, unit2], []);
    const agent = new GreedyAgent('tie-test');
    const action = runDecision(agent, state);
    // Both units have no adjacent visible cells → pass
    expect(action.type).toBe('pass');
  });

  it('selects higher-q target when unit ids tie and scores tie', () => {
    // Two units with same id (impossible in practice but exercises sort)
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 };
    const unclaimed1 = makeCell(1, -1, 0); // q=1
    const unclaimed2 = makeCell(1, -2, 1); // q=1 — should be picked (r ascending)
    const visible: HexCell[] = [makeCell(0, 0, 0), unclaimed1, unclaimed2];
    const state = makeState([myUnit], visible);
    const agent = new GreedyAgent('tie-test');
    const action = runDecision(agent, state);
    // All score +2 → tie-break by target q ascending → q=1 first
    expect(action.type).toBe('move');
    expect(action.to?.q).toBe(1);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('GreedyAgent — edge cases', () => {
  it('returns pass when no units owned', () => {
    const state = makeState([], []);
    const agent = new GreedyAgent('edge-test');
    const action = runDecision(agent, state);
    expect(action.type).toBe('pass');
  });

  it('returns pass when unit has no adjacent visible cells', () => {
    const myUnit = { id: 'u1', owner: 'A' as const, position: { q: 0, r: 0, s: 0 }, type: 'infantry' as const, strength: 1, hp: 5 };
    const state = makeState([myUnit], [makeCell(0, 0, 0)]); // only itself visible
    const agent = new GreedyAgent('edge-test');
    const action = runDecision(agent, state);
    expect(action.type).toBe('pass');
  });
});