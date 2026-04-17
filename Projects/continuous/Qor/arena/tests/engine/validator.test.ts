/**
 * Builder Tick 31 | task-031-validator-tests
 * Tests for action validator
 */

import { describe, it, expect } from 'bun:test';
import { validateAction } from '../../src/gateway/validator';
import type { AgentAction, MatchState, HexCell } from '../../src/shared/types';

// Helper to build minimal state
function makeState(units: MatchState['units']): MatchState {
  return { units, turn: 1, phase: 'action' };
}

const SIDE_A = 'A';
const SIDE_B = 'B';

// CASE 1: valid move
it('valid move passes validation', () => {
  // { q: 3, r: 3, s: -6 } — hex-offset valid, max(3,3,6)=6 <= 8
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 4, r: 3, s: -7 }, // distance 1 from (3,3,-6)
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(true);
});

// CASE 2: valid attack
it('valid attack passes validation', () => {
  const state = makeState([
    { id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 },
    { id: 'u2', owner: SIDE_B, position: { q: 4, r: 3, s: -7 }, type: 'INFANTRY', hp: 1 },
  ]);
  const action: AgentAction = {
    type: 'attack',
    confidence: 0.85,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 4, r: 3, s: -7 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(true);
});

// CASE 3: confidence > 1
it('confidence > 1 is invalid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'move',
    confidence: 1.5,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 4, r: 3, s: -7 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('confidence_out_of_range');
});

// CASE 4: confidence < 0
it('confidence < 0 is invalid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'move',
    confidence: -0.1,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 4, r: 3, s: -7 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('confidence_out_of_range');
});

// CASE 5: foreign unit
it('moving own unit from cell occupied by enemy is invalid', () => {
  // SIDE_B owns the unit at (3,3,-6) — SIDE_A trying to move it fails ownership
  const state = makeState([
    { id: 'u1', owner: SIDE_B, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 },
  ]);
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 4, r: 3, s: -7 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('unit_not_owned_by_side');
});

// CASE 6: off-board target
it('to cell off board is invalid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 9, r: 0, s: -9 }, // max(9,0,9)=9 > 8 → off board
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('to_off_board');
});

// CASE 7: distance 2
it('target at distance 2 is invalid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 5, r: 3, s: -8 }, // dist=2 via cube hex
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('distance_not_one');
});

// CASE 8: pass without from/to
it('pass with no from/to is valid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'pass',
    confidence: 0.5,
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(true);
});

// CASE 9: from_off_board
it('from cell off board is invalid', () => {
  const state = makeState([]);
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 9, r: 0, s: -9 }, // max(9,0,9)=9 > 8 → off board
    to:   { q: 1, r: 0, s: -1 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('from_off_board');
});

// CASE 10: no unit at from
it('no unit at from position is invalid', () => {
  const state = makeState([]); // no units at all
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 4, r: 3, s: -7 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('no_unit_at_from');
});

// CASE 11: from equals to
it('from equals to is invalid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action: AgentAction = {
    type: 'move',
    confidence: 0.9,
    from: { q: 3, r: 3, s: -6 },
    to:   { q: 3, r: 3, s: -6 },
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('from_equals_to');
});

// CASE 12: unknown action type
it('unknown action type is invalid', () => {
  const state = makeState([{ id: 'u1', owner: SIDE_A, position: { q: 3, r: 3, s: -6 }, type: 'INFANTRY', hp: 1 }]);
  const action = {
    type: 'foobar' as any,
    confidence: 0.9,
  };
  const result = validateAction(action, state, SIDE_A);
  expect(result.valid).toBe(false);
  expect(result.reason).toBe('unknown_action_type');
});