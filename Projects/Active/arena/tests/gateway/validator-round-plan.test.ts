import { test, expect } from "bun:test";
import { validateRoundPlan } from "../../src/gateway/validator";
import type { RoundPlan, MatchState } from "../../src/shared/types";

function makeState(units: MatchState["units"]): MatchState {
  return {
    turn: 1,
    yourTurn: true,
    visible: [],
    units,
    score: { a: 0, b: 0 },
    deadline: 0,
  };
}

function makeBudget(apPool = 3) {
  return { apPool };
}

test("validateRoundPlan: pass plan valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  expect(validateRoundPlan({ bid: 0, extras: [] }, "A", state, makeBudget())).toEqual({ ok: true });
});

test("validateRoundPlan: invalid owner rejects", () => {
  const state = makeState([
    { id: "u1", owner: "B", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } }, extras: [] };
  expect(validateRoundPlan(plan, "A", state, makeBudget())).toEqual({ ok: false, reason: "unit_not_owned:u1" });
});

test("validateRoundPlan: wrong move distance rejects", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: 0, s: -1 } }, extras: [] };
  expect(validateRoundPlan(plan, "A", state, makeBudget())).toEqual({ ok: false, reason: "move_distance_wrong:got1want2" });
});

test("validateRoundPlan: ap exceeds pool rejects", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = { bid: 5, extras: [] };
  expect(validateRoundPlan(plan, "A", state, makeBudget())).toEqual({ ok: false, reason: "ap_exceeds_pool" });
});

test("validateRoundPlan: duplicate extras rejects", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = {
    bid: 0,
    extras: [
      { kind: "boosted_ability", unitId: "u1" },
      { kind: "defensive_stance", unitId: "u1" },
    ],
  };
  expect(validateRoundPlan(plan, "A", state, makeBudget())).toEqual({ ok: false, reason: "duplicate_extra_on_unit:u1" });
});

test("validateRoundPlan: full valid plan passes", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
    { id: "u2", owner: "A", position: { q: 2, r: 0, s: -2 }, strength: 1, hp: 1, type: "scout" },
  ]);
  const plan: RoundPlan = {
    bid: 1,
    freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } },
    extras: [{ kind: "boosted_ability", unitId: "u2" }],
  };
  expect(validateRoundPlan(plan, "A", state, makeBudget())).toEqual({ ok: true });
});

test("validateRoundPlan: executes helpers in correct order", () => {
  // ownership fires first — if ownership fails, later helpers are not reached
  const state = makeState([
    { id: "u1", owner: "B", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = {
    bid: 99, // would fail ap check first if we got there
    freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: 0, s: -1 } },
    extras: [],
  };
  expect(validateRoundPlan(plan, "A", state, makeBudget())).toEqual({ ok: false, reason: "unit_not_owned:u1" });
});