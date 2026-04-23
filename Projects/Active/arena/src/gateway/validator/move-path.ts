import type { RoundPlan } from "../../shared/types";
import type { MatchState } from "../../shared/types";

export interface MovePathResult {
  ok: true;
}
export interface MovePathFail {
  ok: false;
  reason: string;
}

function isOnBoard(coord: { q: number; r: number; s: number }): boolean {
  return Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s)) <= 8;
}

function hexDistance(a: { q: number; r: number; s: number }, b: { q: number; r: number; s: number }): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

/**
 * Validates the freeMove path:
 * - from and to are on board
 * - from and to are distinct
 * - cube distance from -> to equals MOVE_POINTS[unit.type]
 */
export function validateMovePath(
  plan: RoundPlan,
  _agent: "A" | "B",
  state: Pick<MatchState, "units">
): MovePathResult | MovePathFail {
  const fm = plan.freeMove;
  if (!fm) return { ok: true };

  if (!isOnBoard(fm.from)) return { ok: false, reason: "move_from_off_board" };
  if (!isOnBoard(fm.to)) return { ok: false, reason: "move_to_off_board" };

  if (fm.from.q === fm.to.q && fm.from.r === fm.to.r && fm.from.s === fm.to.s) {
    return { ok: false, reason: "move_from_equals_to" };
  }

  const unit = state.units.find(u => u.id === fm.unitId);
  if (!unit) return { ok: false, reason: `unit_not_found:${fm.unitId}` };

  const dist = hexDistance(fm.from, fm.to);
  const movePoints = unit.type === "scout" ? 3 : unit.type === "heavy" ? 1 : 2;
  if (dist !== movePoints) {
    return { ok: false, reason: `move_distance_wrong:got${dist}want${movePoints}` };
  }

  return { ok: true };
}
