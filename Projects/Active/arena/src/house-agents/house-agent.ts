import { BaseAgent } from "../agents/base.ts";
import type { AgentRoundBudget, MatchState, RoundPlan } from "../shared/types.ts";
import { deterministicFallbackPlanner } from "./fallback.ts";
import { parseRoundPlan } from "./parse.ts";
import { buildHousePrompt } from "./prompt.ts";
import type { HouseFallbackPlanner, HouseModelClient, HouseTier, PolicyPack } from "./types.ts";

export class HouseAgent extends BaseAgent {
  constructor(
    readonly tier: HouseTier,
    readonly policyPack: PolicyPack,
    private readonly modelClient: HouseModelClient,
    private readonly fallbackPlanner: HouseFallbackPlanner = deterministicFallbackPlanner,
  ) {
    super(`house-${tier}`, policyPack.id);
  }

  async getRoundPlan(
    state: MatchState,
    budget: AgentRoundBudget,
  ): Promise<RoundPlan> {
    const prompt = buildHousePrompt(state, budget, this.policyPack);
    try {
      const response = await this.modelClient.complete({
        tier: this.tier,
        prompt,
        state,
        budget,
        policyPack: this.policyPack,
      });
      return parseRoundPlan(response.text);
    } catch {
      return this.fallbackPlanner.buildPlan(state, budget, this.policyPack);
    }
  }
}
