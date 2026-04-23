import type { RoundPlan } from "../../shared/types";
import type { MatchState } from "../../shared/types";

export interface OwnershipResult {
  ok: true;
}
export interface OwnershipFail {
  ok: false;
  reason: string;
}

/**
 * Validates that every unitId referenced in the plan belongs to the specified agent.
 * R4 trust: we trust the unitId exists; existence is validated by the resolver stub in Phase 3.
 */
export function validateOwnership(
  plan: RoundPlan,
  agent: "A" | "B",
  state: Pick<MatchState, "units">
): OwnershipResult | OwnershipFail {
  const unitIds: string[] = [];
  if (plan.freeMove?.unitId) unitIds.push(plan.freeMove.unitId);
  if (plan.freeAction?.unitId) unitIds.push(plan.freeAction.unitId);
  for (const ex of plan.extras) unitIds.push(ex.unitId);

  for (const uid of unitIds) {
    const unit = state.units.find(u => u.id === uid);
    if (!unit) {
      return { ok: false, reason: `unit_not_found:${uid}` };
    }
    if (unit.owner !== agent) {
      return { ok: false, reason: `unit_not_owned:${uid}` };
    }
  }
  return { ok: true };
}
