import type { AgentRoundBudget, MatchState, RoundPlan } from "../shared/types.ts";
import type { HouseFallbackPlanner, PolicyPack } from "./types.ts";

function firstAttackPlan(state: MatchState): RoundPlan | null {
  const actor = state.units[0];
  const target = state.visible.find((cell) => cell.unit && actor && cell.unit.owner !== actor.owner);
  if (!target || !actor) return null;
  return {
    bid: 0,
    extras: [],
    freeAction: {
      unitId: actor.id,
      type: "attack",
      from: actor.position,
      to: target.position,
    },
  };
}

function firstMovePlan(state: MatchState): RoundPlan | null {
  const actor = state.units[0];
  const target = state.visible.find((cell) => !cell.unit);
  if (!actor || !target) return null;
  return {
    bid: 0,
    extras: [],
    freeMove: {
      unitId: actor.id,
      from: actor.position,
      to: target.position,
    },
  };
}

export const deterministicFallbackPlanner: HouseFallbackPlanner = {
  buildPlan(
    state: MatchState,
    budget: AgentRoundBudget,
    policyPack: PolicyPack,
  ): RoundPlan {
    const bid = Math.min(policyPack.planningHorizon - 1, budget.apPool);
    return (
      firstAttackPlan(state) ??
      firstMovePlan(state) ?? {
        bid,
        extras: [],
      }
    );
  },
};
