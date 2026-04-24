import { describe, expect, test } from "bun:test";
import { deterministicFallbackPlanner } from "../../src/house-agents/fallback.ts";
import { getPolicyPack } from "../../src/house-agents/policy-pack.ts";
import type { MatchState } from "../../src/shared/types.ts";

const baseState: MatchState = {
  turn: 1,
  visible: [
    { position: { q: 0, r: 1, s: -1 }, terrain: "plain" },
  ],
  units: [
    {
      id: "u1",
      owner: "A",
      position: { q: 0, r: 0, s: 0 },
      strength: 4,
      hp: 5,
      type: "infantry",
    },
  ],
  score: { a: 0, b: 0 },
  deadline: Date.now() + 1000,
  roundCap: 50,
};

describe("deterministicFallbackPlanner", () => {
  test("returns a valid move plan when an empty cell exists", () => {
    const plan = deterministicFallbackPlanner.buildPlan(
      baseState,
      { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 },
      getPolicyPack("starter"),
    );
    expect(plan.extras).toEqual([]);
    expect(plan.freeMove?.unitId).toBe("u1");
  });

  test("is deterministic for the same state", () => {
    const budget = { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 };
    const pack = getPolicyPack("contender");
    expect(
      JSON.stringify(deterministicFallbackPlanner.buildPlan(baseState, budget, pack)),
    ).toBe(
      JSON.stringify(deterministicFallbackPlanner.buildPlan(baseState, budget, pack)),
    );
  });
});
