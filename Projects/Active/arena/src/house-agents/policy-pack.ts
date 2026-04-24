import { APEX_POLICY_PACK } from "./packs/apex.ts";
import { CONTENDER_POLICY_PACK } from "./packs/contender.ts";
import { STARTER_POLICY_PACK } from "./packs/starter.ts";
import type { HouseTier, PolicyPack } from "./types.ts";

const PACKS: Record<HouseTier, PolicyPack> = {
  starter: STARTER_POLICY_PACK,
  contender: CONTENDER_POLICY_PACK,
  apex: APEX_POLICY_PACK,
};

export function assertValidPolicyPack(pack: PolicyPack): void {
  const doctrineValues = Object.values(pack.doctrine);
  if (doctrineValues.some((value) => value.length === 0)) {
    throw new Error(`policy pack ${pack.id} has empty doctrine sections`);
  }
  if (new Set(pack.antiPatterns).size !== pack.antiPatterns.length) {
    throw new Error(`policy pack ${pack.id} has duplicate anti-patterns`);
  }
}

export function getPolicyPack(tier: HouseTier): PolicyPack {
  const pack = PACKS[tier];
  assertValidPolicyPack(pack);
  return pack;
}

export function listPolicyPacks(): PolicyPack[] {
  return (Object.keys(PACKS) as HouseTier[]).map(getPolicyPack);
}
