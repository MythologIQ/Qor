// Builder Tick 30 | validateAction
// task-030-validator-impl

import type { AgentAction, MatchState, HexCell } from '../shared/types';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

function isOnBoard(coord: { q: number; r: number; s: number }): boolean {
  return (
    Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s)) <= 8
  );
}

function hexDistance(a: { q: number; r: number; s: number }, b: { q: number; r: number; s: number }): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s)
  );
}

function findUnit(units: MatchState['units'], q: number, r: number, s: number) {
  return units.find(u => u.position.q === q && u.position.r === r && u.position.s === s);
}

export function validateAction(action: AgentAction, state: MatchState, side: 'A' | 'B'): ValidationResult {
  // confidence in [0, 1]
  if (typeof action.confidence !== 'number' || action.confidence < 0 || action.confidence > 1) {
    return { valid: false, reason: 'confidence_out_of_range' };
  }

  // from/to required by action type
  if (action.type === 'move' || action.type === 'attack') {
    if (!action.from || !action.to) {
      return { valid: false, reason: 'from_to_required_for_move_attack' };
    }

    // from and to must be distinct
    if (
      action.from.q === action.to.q &&
      action.from.r === action.to.r &&
      action.from.s === action.to.s
    ) {
      return { valid: false, reason: 'from_equals_to' };
    }

    // from on board
    if (!isOnBoard(action.from)) {
      return { valid: false, reason: 'from_off_board' };
    }

    // to on board
    if (!isOnBoard(action.to)) {
      return { valid: false, reason: 'to_off_board' };
    }

    // distance for move/attack = 1
    if (hexDistance(action.from, action.to) !== 1) {
      return { valid: false, reason: 'distance_not_one' };
    }

    // from owned by side
    const fromUnit = findUnit(state.units, action.from.q, action.from.r, action.from.s);
    if (!fromUnit) {
      return { valid: false, reason: 'no_unit_at_from' };
    }
    if (fromUnit.owner !== side) {
      return { valid: false, reason: 'unit_not_owned_by_side' };
    }
  } else if (action.type === 'pass') {
    // pass has no from/to requirement — nothing extra to check
  } else {
    return { valid: false, reason: 'unknown_action_type' };
  }

  return { valid: true };
}

// --- Builder Tick 153: Action Validator (typed action schemas) ---

export type Action = ValidateActionSuccess['action'];

export type ValidateActionSuccess =
  | { ok: true; action: { type: 'move'; from: { q: number; r: number; s: number }; to: { q: number; r: number; s: number }; confidence: number } }
  | { ok: true; action: { type: 'attack'; from: { q: number; r: number; s: number }; to: { q: number; r: number; s: number }; confidence: number } }
  | { ok: true; action: { type: 'pass'; confidence: number } };

function isCubeCoord(v: unknown): v is { q: number; r: number; s: number } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.q === 'number' &&
    typeof obj.r === 'number' &&
    typeof obj.s === 'number' &&
    Number.isInteger(obj.q) &&
    Number.isInteger(obj.r) &&
    Number.isInteger(obj.s)
  );
}

function isValidConfidence(v: unknown): v is number {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

/**
 * Validates raw agent input against the Action whitelist contract.
 * Returns a typed Action on success, or {ok:false, code, message} on failure.
 * Whitelist: move, attack, pass. No nested ternaries.
 */
export function validateActionRaw(
  raw: unknown
): ValidateActionSuccess | { ok: false; code: string; message: string } {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return { ok: false, code: 'invalid_input', message: 'action must be a non-null object' };
  }

  const obj = raw as Record<string, unknown>;

  // type check
  if (typeof obj.type !== 'string') {
    return { ok: false, code: 'missing_type', message: 'action.type must be a string' };
  }

  const type = obj.type;
  if (type !== 'move' && type !== 'attack' && type !== 'pass') {
    return { ok: false, code: 'unknown_action_type', message: 'action.type must be one of: move, attack, pass' };
  }

  // confidence
  if (!isValidConfidence(obj.confidence)) {
    return { ok: false, code: 'confidence_out_of_range', message: 'action.confidence must be a number in [0, 1]' };
  }

  const confidence = obj.confidence as number;

  if (type === 'move' || type === 'attack') {
    if (!isCubeCoord(obj.from)) {
      return { ok: false, code: 'from_required', message: 'move/attack actions require action.from as {q,r,s}' };
    }
    if (!isCubeCoord(obj.to)) {
      return { ok: false, code: 'to_required', message: 'move/attack actions require action.to as {q,r,s}' };
    }
    const from = obj.from as { q: number; r: number; s: number };
    const to = obj.to as { q: number; r: number; s: number };
    return {
      ok: true,
      action: { type, from, to, confidence },
    };
  }

  // pass — no from/to
  return {
    ok: true,
    action: { type: 'pass', confidence },
  };
}
