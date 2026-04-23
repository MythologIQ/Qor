import { test, expect } from "bun:test";
import { validateExtrasUniqueness } from "../../../src/gateway/validator/extras-uniqueness";
import type { RoundPlan } from "../../../src/shared/types";

test("extras-uniqueness: no extras is valid", () => {
  expect(validateExtrasUniqueness({ extras: [] })).toEqual({ ok: true });
});

test("extras-uniqueness: unique extras valid", () => {
  const plan = { extras: [{ kind: "boosted_ability", unitId: "u1" }, { kind: "second_attack", unitId: "u2" }] } as RoundPlan;
  expect(validateExtrasUniqueness(plan)).toEqual({ ok: true });
});

test("extras-uniqueness: duplicate extra on same unit invalid", () => {
  const plan = { extras: [{ kind: "boosted_ability", unitId: "u1" }, { kind: "defensive_stance", unitId: "u1" }] } as RoundPlan;
  expect(validateExtrasUniqueness(plan)).toEqual({ ok: false, reason: "duplicate_extra_on_unit:u1" });
});

test("extras-uniqueness: two different units same extra kind valid", () => {
  const plan = { extras: [{ kind: "boosted_ability", unitId: "u1" }, { kind: "boosted_ability", unitId: "u2" }] } as RoundPlan;
  expect(validateExtrasUniqueness(plan)).toEqual({ ok: true });
});