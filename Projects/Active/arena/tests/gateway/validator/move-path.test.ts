import { test, expect } from "bun:test";
import { validateMovePath } from "../../../src/gateway/validator/move-path";
import type { RoundPlan, MatchState } from "../../../src/shared/types";

function makeState(units: MatchState["units"]): Pick<MatchState, "units"> {
  return { units };
}

test("move-path: pass plan is valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  expect(validateMovePath({ bid: 0, extras: [] }, "A", state)).toEqual({ ok: true });
});

test("move-path: infantry move distance 2 valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 2, r: 0, s: -2 } }, extras: [] };
  expect(validateMovePath(plan as RoundPlan, "A", state)).toEqual({ ok: true });
});

test("move-path: infantry move distance 1 invalid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: 0, s: -1 } }, extras: [] };
  expect(validateMovePath(plan as RoundPlan, "A", state)).toEqual({ ok: false, reason: "move_distance_wrong:got1want2" });
});

test("move-path: scout move distance 3 valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "scout" },
  ]);
  const plan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 3, r: 0, s: -3 } }, extras: [] };
  expect(validateMovePath(plan as RoundPlan, "A", state)).toEqual({ ok: true });
});

test("move-path: heavy move distance 1 valid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "heavy" },
  ]);
  const plan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: 0, s: -1 } }, extras: [] };
  expect(validateMovePath(plan as RoundPlan, "A", state)).toEqual({ ok: true });
});

test("move-path: from equals to invalid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan = { bid: 0, freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 0, r: 0, s: 0 } }, extras: [] };
  expect(validateMovePath(plan as RoundPlan, "A", state)).toEqual({ ok: false, reason: "move_from_equals_to" });
});

test("move-path: from off board invalid", () => {
  const state = makeState([
    { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
  ]);
  const plan = { bid: 0, freeMove: { unitId: "u1", from: { q: 99, r: 0, s: -99 }, to: { q: 2, r: 0, s: -2 } }, extras: [] };
  expect(validateMovePath(plan as RoundPlan, "A", state)).toEqual({ ok: false, reason: "move_from_off_board" });
});