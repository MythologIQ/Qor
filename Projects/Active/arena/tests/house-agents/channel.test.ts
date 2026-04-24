import { describe, expect, test } from "bun:test";
import { LocalAgentChannel } from "../../src/house-agents/channel.ts";
import { BaseAgent } from "../../src/agents/base.ts";
import type { MatchState, RoundPlan } from "../../src/shared/types.ts";

class StubAgent extends BaseAgent {
  getRoundPlan(): RoundPlan {
    return { bid: 0, extras: [] };
  }
}

const state: MatchState = {
  turn: 1,
  visible: [],
  units: [],
  score: { a: 0, b: 0 },
  deadline: Date.now() + 1000,
  roundCap: 50,
};

describe("LocalAgentChannel", () => {
  test("returns a plan through the AgentChannel seam", async () => {
    const channel = new LocalAgentChannel(new StubAgent("stub"));
    channel.send({
      state,
      budget: { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 },
    });
    await expect(channel.receivePlan?.()).resolves.toEqual({ bid: 0, extras: [] });
  });
});
