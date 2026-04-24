// HexaWars Plan D v2 — RoundPlan validator
//
// Aggregates seven sub-validators; each inspects one facet of a RoundPlan.
// Legacy per-action (`validateAction`, `validateActionRaw`) is gone; Plan D v2
// is round-grained, so input is always a RoundPlan.

import type { MatchState, RoundPlan } from '../shared/types';
import { validateOwnership } from './validator/ownership';
import { validateApArithmetic } from './validator/ap-arithmetic';
import { validateMovePath } from './validator/move-path';
import { validateAttackRange } from './validator/attack-range';
import { validateExtrasUniqueness } from './validator/extras-uniqueness';
import { validateBoostedAbilityRequirement } from './validator/boosted-ability-requirement';
import { validateExtrasDisallowed } from './validator/extras-disallowed';

export type RoundPlanValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateRoundPlan(
  plan: RoundPlan,
  agent: 'A' | 'B',
  state: MatchState,
  budget: { apPool: number },
): RoundPlanValidationResult {
  const checks = [
    () => validateOwnership(plan, agent, state),
    () => validateApArithmetic(plan, budget.apPool),
    () => validateMovePath(plan, agent, state),
    () => validateAttackRange(plan, agent, state),
    () => validateExtrasUniqueness(plan),
    () => validateBoostedAbilityRequirement(plan),
    () => validateExtrasDisallowed(plan),
  ];
  for (const check of checks) {
    const r = check();
    if (!r.ok) return { ok: false, reason: r.reason };
  }
  return { ok: true };
}
