import type { ExtraEntry } from "../../shared/types";

export interface BoostedAbilityResult {
  ok: true;
}
export interface BoostedAbilityFail {
  ok: false;
  reason: string;
}

export function validateBoostedAbilityRequirement(
  plan: { extras: ExtraEntry[] }
): BoostedAbilityResult | BoostedAbilityFail {
  // Placeholder: boosted ability prerequisites not yet defined.
  // Reject if a boosted_ability extra references a non-existent unitId (covered by ownership).
  return { ok: true };
}
