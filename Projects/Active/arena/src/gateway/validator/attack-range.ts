import type { RoundPlan } from "../../shared/types";
import type { MatchState } from "../../shared/types";
import type { UnitType } from "../../engine/units";

export interface AttackRangeResult {
  ok: true;
}
export interface AttackRangeFail {
  ok: false;
  reason: string;
}

const RANGE: Record<Exclude<UnitType, undefined>, number> = {
  infantry: 1,
  scout: 1,
  heavy: 2,
};

function hexDistance(a: { q: number; r: number; s: number }, b: { q: number; r: number; s: number }): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

function isOnBoard(coord: { q: number; r: number; s: number }): boolean {
  return Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s)) <= 8;
}

/**
 * Validates attack targets in freeAction and extras are within RANGE of the attacker unit.
 */
export function validateAttackRange(
  plan: RoundPlan,
  _agent: "A" | "B",
  state: Pick<MatchState, "units">
): AttackRangeResult | AttackRangeFail {
  if (plan.freeAction) {
    const fa = plan.freeAction;
    if (fa.type === "attack") {
      if (!isOnBoard(fa.to)) return { ok: false, reason: "attack_to_off_board" };
      const unit = state.units.find(u => u.id === fa.unitId);
      if (!unit) return { ok: false, reason: `unit_not_found:${fa.unitId}` };
      const dist = hexDistance(unit.position, fa.to);
      if (dist > RANGE[unit.type]) {
        return { ok: false, reason: `attack_out_of_range:dist${dist}max${RANGE[unit.type]}` };
      }
    }
  }

  for (const ex of plan.extras) {
    if (ex.kind !== "second_attack" && ex.kind !== "boosted_ability") continue;
    if (!ex.to) continue;
    if (!isOnBoard(ex.to)) return { ok: false, reason: "extra_attack_to_off_board" };
    const unit = state.units.find(u => u.id === ex.unitId);
    if (!unit) return { ok: false, reason: `unit_not_found:${ex.unitId}` };
    const dist = hexDistance(unit.position, ex.to);
    if (dist > RANGE[unit.type]) {
      return { ok: false, reason: `extra_attack_out_of_range:${ex.unitId}dist${dist}` };
    }
  }

  return { ok: true };
}
