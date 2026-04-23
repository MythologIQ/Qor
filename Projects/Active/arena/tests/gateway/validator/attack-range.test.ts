import { test, expect } from "bun:test";
import { validateAttackRange } from "../../../src/gateway/validator/attack-range";
import type { RoundPlan, MatchState } from "../../../src/shared/types";

function makeState(units: MatchState["units"]): Pick<MatchState, "units"> {
  return { units };
}

test("attack-range: pass plan is valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  expect(validateAttackRange({ bid: 0, extras: [] }, "A", state)).toEqual({ ok: true });
});

test("attack-range: infantry attack adjacent valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
    { id: "u2", owner: "B", position: { q: 1, r: 0, s: -1 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = {
    bid: 0,
    freeAction: { unitId: "u1", type: "attack", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: 0, s: -1 } },
    extras: [],
  };
  expect(validateAttackRange(plan, "A", state)).toEqual({ ok: true });
});

test("attack-range: infantry attack dist 2 out of range", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
    { id: "u2", owner: "B", position: { q: 3, r: 0, s: -3 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = {
    bid: 0,
    freeAction: { unitId: "u1", type: "attack", from: { q: 0, r: 0, s: 0 }, to: { q: 3, r: 0, s: -3 } },
    extras: [],
  };
  expect(validateAttackRange(plan, "A", state)).toEqual({ ok: false, reason: "attack_out_of_range:dist3max1" });
});

test("attack-range: heavy attack dist 2 valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "heavy" },
    { id: "u2", owner: "B", position: { q: 2, r: 0, s: -2 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = {
    bid: 0,
    freeAction: { unitId: "u1", type: "attack", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } },
    extras: [],
  };
  expect(validateAttackRange(plan, "A", state)).toEqual({ ok: true });
});

test("attack-range: extra attack out of range", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
    { id: "u2", owner: "B", position: { q: 3, r: 0, s: -3 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = {
    bid: 0,
    extras: [{ kind: "second_attack", unitId: "u1", to: { q: 3, r: 0, s: -3 } }],
  };
  expect(validateAttackRange(plan, "A", state)).toEqual({ ok: false, reason: "extra_attack_out_of_range:u1dist3" });
});