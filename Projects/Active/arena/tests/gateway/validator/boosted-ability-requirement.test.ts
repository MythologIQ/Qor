import { test, expect } from "bun:test";
import { validateBoostedAbilityRequirement } from "../../../src/gateway/validator/boosted-ability-requirement";
import type { RoundPlan } from "../../../src/shared/types";

test("boosted-ability: pass plan valid", () => {
  expect(validateBoostedAbilityRequirement({ extras: [] })).toEqual({ ok: true });
});

test("boosted-ability: extras present valid", () => {
  const plan = { extras: [{ kind: "boosted_ability", unitId: "u1" }] } as RoundPlan;
  expect(validateBoostedAbilityRequirement(plan)).toEqual({ ok: true });
});