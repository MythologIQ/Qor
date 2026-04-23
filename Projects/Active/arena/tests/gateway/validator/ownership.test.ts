import { test, expect } from "bun:test";
import { validateOwnership } from "../../../src/gateway/validator/ownership";
import type { RoundPlan, MatchState } from "../../../src/shared/types";

function makeState(units: MatchState["units"]): Pick<MatchState, "units"> {
  return { units };
}

function passPlan(): RoundPlan {
  return { bid: 0, extras: [] };
}

test("ownership: pass plan is valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  expect(validateOwnership(passPlan(), "A", state)).toEqual({ ok: true });
});

test("ownership: unit not found", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = { bid: 0, freeMove: { unitId: "u99", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } }, extras: [] };
  expect(validateOwnership(plan, "A", state)).toEqual({ ok: false, reason: "unit_not_found:u99" });
});

test("ownership: unit not owned by agent", () => {
  const state = makeState([
    { id: "u1", owner: "B", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan: RoundPlan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } }, extras: [] };
  expect(validateOwnership(plan, "A", state)).toEqual({ ok: false, reason: "unit_not_owned:u1" });
});

test("ownership: valid freeMove and extras on owned units", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
    { id: "u2", owner: "A", position: { q: 1, r: 0, s: -1 }, strength: 1, hp: 1, type: "scout" },
  ]);
  const plan: RoundPlan = {
    bid: 1,
    freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } },
    freeAction: { unitId: "u2", type: "attack", from: { q: 1, r: 0, s: -1 }, to: { q: 2, r: 0, s: -2 } },
    extras: [{ kind: "boosted_ability", unitId: "u1" }],
  };
  expect(validateOwnership(plan, "A", state)).toEqual({ ok: true });
});