// Builder Tick 30 | validateAction
// task-030-validator-impl

import type { AgentAction, MatchState, HexCell } from '../shared/types';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

function isOnBoard(coord: { q: number; r: number; s: number }): boolean {
  return (
    coord.q >= 0 && coord.q <= 8 &&
    coord.r >= 0 && coord.r <= 8 &&
    coord.s >= 0 && coord.s <= 8
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
