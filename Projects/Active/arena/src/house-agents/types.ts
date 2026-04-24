import type { MatchState, RoundPlan, AgentRoundBudget } from "../shared/types.ts";

export type HouseTier = "starter" | "contender" | "apex";

export interface PolicyPack {
  id: string;
  tier: HouseTier;
  modelId: string;
  planningHorizon: 1 | 2 | 3;
  doctrine: {
    opening: string[];
    terrain: string[];
    threat: string[];
    bidding: string[];
    targeting: string[];
    endgame: string[];
  };
  matchupNotes: Record<string, string[]>;
  antiPatterns: string[];
}

export interface HouseModelRequest {
  tier: HouseTier;
  prompt: string;
  state: MatchState;
  budget: AgentRoundBudget;
  policyPack: PolicyPack;
}

export interface HouseModelResponse {
  text: string;
}

export interface HouseModelClient {
  complete(request: HouseModelRequest): Promise<HouseModelResponse>;
}

export interface HouseFallbackPlanner {
  buildPlan(
    state: MatchState,
    budget: AgentRoundBudget,
    policyPack: PolicyPack,
  ): RoundPlan;
}
