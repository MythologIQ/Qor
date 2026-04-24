import type { RoundPlan } from "../../shared/types";

export type ExtrasDisallowedResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Plan D v2 Phases 3–5 temporarily disallows non-empty extras. Dispatch paths
 * for extras (boosted_ability, second_attack, defensive_stance,
 * reserve_overwatch) are defined in types.ts but not implemented here. A
 * successor plan will remove this rejector and wire runtime dispatch.
 */
export function validateExtrasDisallowed(plan: RoundPlan): ExtrasDisallowedResult {
  if (plan.extras.length > 0) {
    return { ok: false, reason: "EXTRAS_NOT_IMPLEMENTED" };
  }
  return { ok: true };
}
