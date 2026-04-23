import type { ExtraEntry } from "../../shared/types";

export interface ExtrasUniquenessResult {
  ok: true;
}
export interface ExtrasUniquenessFail {
  ok: false;
  reason: string;
}

export function validateExtrasUniqueness(
  plan: { extras: ExtraEntry[] }
): ExtrasUniquenessResult | ExtrasUniquenessFail {
  const seen = new Map<string, number>();
  for (const ex of plan.extras) {
    const count = seen.get(ex.unitId) ?? 0;
    if (count > 0) {
      return { ok: false, reason: `duplicate_extra_on_unit:${ex.unitId}` };
    }
    seen.set(ex.unitId, count + 1);
  }
  return { ok: true };
}
