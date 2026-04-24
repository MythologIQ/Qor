import { LocalAgentChannel } from "./channel.ts";
import { HttpHouseModelClient } from "./http-model-client.ts";
import { HouseAgent } from "./house-agent.ts";
import { getPolicyPack } from "./policy-pack.ts";
import type { HouseModelClient, HouseTier } from "./types.ts";

export function createHouseAgent(
  tier: HouseTier,
  modelClient: HouseModelClient,
): HouseAgent {
  return new HouseAgent(tier, getPolicyPack(tier), modelClient);
}

export function createStarterHouseAgent(modelClient: HouseModelClient): HouseAgent {
  return createHouseAgent("starter", modelClient);
}

export function createContenderHouseAgent(modelClient: HouseModelClient): HouseAgent {
  return createHouseAgent("contender", modelClient);
}

export function createApexHouseAgent(modelClient: HouseModelClient): HouseAgent {
  return createHouseAgent("apex", modelClient);
}

export function createHouseChannel(
  tier: HouseTier,
  modelClient: HouseModelClient = new HttpHouseModelClient(),
): LocalAgentChannel {
  return new LocalAgentChannel(createHouseAgent(tier, modelClient));
}
