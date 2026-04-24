import type { AgentRoundBudget, MatchState } from "../shared/types.ts";
import type { PolicyPack } from "./types.ts";

export function buildHousePrompt(
  state: MatchState,
  budget: AgentRoundBudget,
  policyPack: PolicyPack,
): string {
  return [
    `Tier: ${policyPack.tier}`,
    `Planning horizon: ${policyPack.planningHorizon}`,
    `Doctrine opening: ${policyPack.doctrine.opening.join(" | ")}`,
    `Doctrine threat: ${policyPack.doctrine.threat.join(" | ")}`,
    `Doctrine bidding: ${policyPack.doctrine.bidding.join(" | ")}`,
    `Budget AP: ${budget.apPool}, carry: ${budget.apCarry}`,
    `Turn: ${state.turn}/${state.roundCap}`,
    `Units: ${state.units.length}`,
    "Respond with JSON for a RoundPlan object.",
  ].join("\n");
}
