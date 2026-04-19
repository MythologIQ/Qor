import { describe, expect, test } from 'bun:test';
import { validateAction, validateActionRaw } from '../../src/gateway/validator';
import type { AgentAction, MatchState } from '../../src/shared/types';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    turn: 1,
    yourTurn: true,
    visible: [],
    units: [
      { id: 'u1', owner: 'A', position: { q: 0, r: 0, s: 0 }, strength: 5, hp: 5, type: 'infantry' },
      { id: 'u2', owner: 'A', position: { q: 1, r: -1, s: 0 }, strength: 5, hp: 5, type: 'scout' },
      { id: 'u3', owner: 'B', position: { q: -1, r: 1, s: 0 }, strength: 5, hp: 5, type: 'infantry' },
    ],
    score: { a: 0, b: 0 },
    deadline: Date.now() + 5000,
    ...overrides,
  };
}

// ── validateAction tests ────────────────────────────────────────────────────

describe('validateAction', () => {
  describe('move actions', () => {
    test('accepts a valid move by side A', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: 0, r: 0, s: 0 },
        to: { q: 1, r: -1, s: 0 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(true);
    });

    test('accepts a valid move with negative s coordinate', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: -2, r: 1, s: 1 },
        to: { q: -1, r: 1, s: 0 },
        confidence: 0.8,
      };
      const state = makeState({
        units: [
          { id: 'u1', owner: 'A', position: { q: -2, r: 1, s: 1 }, strength: 5, hp: 5, type: 'infantry' },
          { id: 'u3', owner: 'B', position: { q: -1, r: 1, s: 0 }, strength: 5, hp: 5, type: 'infantry' },
        ],
      });
      const result = validateAction(action, state, 'A');
      expect(result.valid).toBe(true);
    });

    test('rejects move when distance is not one', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: 0, r: 0, s: 0 },
        to: { q: 2, r: -2, s: 0 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('distance_not_one');
    });

    test('rejects move when from equals to', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: 0, r: 0, s: 0 },
        to: { q: 0, r: 0, s: 0 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('from_equals_to');
    });

    test('rejects move when from is off board', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: 10, r: -10, s: 0 },
        to: { q: 9, r: -9, s: 0 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('from_off_board');
    });

    test('rejects move when to is off board', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: 0, r: 0, s: 0 },
        to: { q: 9, r: -9, s: 0 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('to_off_board');
    });

    test('rejects move when no unit is at from position', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: 2, r: -2, s: 0 },
        to: { q: 1, r: -1, s: 0 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('no_unit_at_from');
    });

    test('rejects move when unit at from is not owned by the acting side', () => {
      const action: AgentAction = {
        type: 'move',
        from: { q: -1, r: 1, s: 0 },
        to: { q: 0, r: 1, s: -1 },
        confidence: 0.9,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('unit_not_owned_by_side');
    });

    test('rejects move when from is missing', () => {
      const action = {
        type: 'move',
        to: { q: 1, r: -1, s: 0 },
        confidence: 0.9,
      } as AgentAction;
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('from_to_required_for_move_attack');
    });

    test('rejects move when to is missing', () => {
      const action = {
        type: 'move',
        from: { q: 0, r: 0, s: 0 },
        confidence: 0.9,
      } as AgentAction;
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('from_to_required_for_move_attack');
    });
  });

  describe('attack actions', () => {
    test('accepts a valid attack by side B', () => {
      const action: AgentAction = {
        type: 'attack',
        from: { q: -1, r: 1, s: 0 },
        to: { q: 0, r: 0, s: 0 },
        confidence: 0.95,
      };
      const result = validateAction(action, makeState(), 'B');
      expect(result.valid).toBe(true);
    });

    test('rejects attack when distance is not one', () => {
      const action: AgentAction = {
        type: 'attack',
        from: { q: 0, r: 0, s: 0 },
        to: { q: 0, r: 2, s: -2 },
        confidence: 0.95,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('distance_not_one');
    });
  });

  describe('pass actions', () => {
    test('accepts a valid pass', () => {
      const action: AgentAction = { type: 'pass', confidence: 1.0 };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(true);
    });
  });

  describe('confidence validation', () => {
    test('rejects confidence below 0', () => {
      const action: AgentAction = {
        type: 'pass',
        confidence: -0.1,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('confidence_out_of_range');
    });

    test('rejects confidence above 1', () => {
      const action: AgentAction = {
        type: 'pass',
        confidence: 1.5,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('confidence_out_of_range');
    });

    test('accepts confidence of exactly 0', () => {
      const action: AgentAction = {
        type: 'pass',
        confidence: 0,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(true);
    });

    test('accepts confidence of exactly 1', () => {
      const action: AgentAction = {
        type: 'pass',
        confidence: 1,
      };
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(true);
    });
  });

  describe('unknown action type', () => {
    test('rejects unknown action type', () => {
      const action = { type: 'surrender', confidence: 1.0 } as AgentAction;
      const result = validateAction(action, makeState(), 'A');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('unknown_action_type');
    });
  });
});

// ── validateActionRaw tests ─────────────────────────────────────────────────

describe('validateActionRaw', () => {
  describe('valid inputs', () => {
    test('accepts a valid move action', () => {
      const raw = {
        type: 'move',
        from: { q: 0, r: 0, s: 0 },
        to: { q: 1, r: -1, s: 0 },
        confidence: 0.9,
      };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: true, action: { type: 'move', from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 }, confidence: 0.9 } });
    });

    test('accepts a valid attack action', () => {
      const raw = {
        type: 'attack',
        from: { q: -1, r: 1, s: 0 },
        to: { q: 0, r: 0, s: 0 },
        confidence: 0.95,
      };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: true, action: { type: 'attack', from: { q: -1, r: 1, s: 0 }, to: { q: 0, r: 0, s: 0 }, confidence: 0.95 } });
    });

    test('accepts a valid pass action', () => {
      const raw = { type: 'pass', confidence: 1.0 };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: true, action: { type: 'pass', confidence: 1.0 } });
    });

    test('accepts move with negative s coordinate', () => {
      const raw = {
        type: 'move',
        from: { q: -2, r: 1, s: 1 },
        to: { q: -1, r: 1, s: 0 },
        confidence: 0.8,
      };
      const result = validateActionRaw(raw);
      expect(result.ok).toBe(true);
    });
  });

  describe('error cases', () => {
    test('rejects null input', () => {
      const result = validateActionRaw(null);
      expect(result).toEqual({ ok: false, code: 'invalid_input', message: 'action must be a non-null object' });
    });

    test('rejects undefined input', () => {
      const result = validateActionRaw(undefined);
      expect(result).toEqual({ ok: false, code: 'invalid_input', message: 'action must be a non-null object' });
    });

    test('rejects non-object input', () => {
      const result = validateActionRaw('move');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid_input');
    });

    test('rejects missing type field', () => {
      const raw = { confidence: 0.9 };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: false, code: 'missing_type', message: 'action.type must be a string' });
    });

    test('rejects unknown action type', () => {
      const raw = { type: 'surrender', confidence: 1.0 };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: false, code: 'unknown_action_type', message: 'action.type must be one of: move, attack, pass' });
    });

    test('rejects missing confidence', () => {
      const raw = { type: 'pass' };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: false, code: 'confidence_out_of_range', message: 'action.confidence must be a number in [0, 1]' });
    });

    test('rejects confidence out of range', () => {
      const raw = { type: 'pass', confidence: 2.0 };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: false, code: 'confidence_out_of_range', message: 'action.confidence must be a number in [0, 1]' });
    });

    test('rejects move without from', () => {
      const raw = { type: 'move', to: { q: 1, r: -1, s: 0 }, confidence: 0.9 };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: false, code: 'from_required', message: 'move/attack actions require action.from as {q,r,s}' });
    });

    test('rejects move without to', () => {
      const raw = { type: 'move', from: { q: 0, r: 0, s: 0 }, confidence: 0.9 };
      const result = validateActionRaw(raw);
      expect(result).toEqual({ ok: false, code: 'to_required', message: 'move/attack actions require action.to as {q,r,s}' });
    });

    test('rejects move when from has non-integer values', () => {
      const raw = { type: 'move', from: { q: 0.5, r: 0, s: -0.5 }, to: { q: 1, r: -1, s: 0 }, confidence: 0.9 };
      const result = validateActionRaw(raw);
      expect(result.ok).toBe(false);
    });

    test('rejects move when from has string values', () => {
      const raw = { type: 'move', from: { q: '0', r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 }, confidence: 0.9 };
      const result = validateActionRaw(raw);
      expect(result.ok).toBe(false);
    });
  });
});
