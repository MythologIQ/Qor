import { describe, expect, test } from "bun:test";
import { HouseAgent } from "../../src/house-agents/house-agent.ts";
import { getPolicyPack } from "../../src/house-agents/policy-pack.ts";
import type { MatchState } from "../../src/shared/types.ts";

const state: MatchState = {
  turn: 1,
  visible: [{ position: { q: 0, r: 1, s: -1 }, terrain: "plain" }],
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

describe("HouseAgent", () => {
  test("uses the configured policy pack and model client", async () => {
    let tierSeen = "";
    const agent = new HouseAgent(
      "apex",
      getPolicyPack("apex"),
      {
        async complete(request) {
          tierSeen = request.tier;
          return { text: "{\"bid\":0,\"extras\":[]}" };
        },
      },
    );

    const plan = await agent.getRoundPlan(state, {
      freeMove: 1,
      freeAction: 1,
      apPool: 3,
      apCarry: 0,
    });

    expect(tierSeen).toBe("apex");
    expect(plan.extras).toEqual([]);
  });

  test("falls back on invalid model output", async () => {
    const agent = new HouseAgent(
      "starter",
      getPolicyPack("starter"),
      {
        async complete() {
          return { text: "not-json" };
        },
      },
    );

    const plan = await agent.getRoundPlan(state, {
      freeMove: 1,
      freeAction: 1,
      apPool: 3,
      apCarry: 0,
    });

    expect(plan.extras).toEqual([]);
    expect(plan.freeMove?.unitId).toBe("u1");
  });
});
