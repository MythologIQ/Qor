import { describe, expect, test } from "bun:test";
import { parseRoundPlan } from "../../src/house-agents/parse.ts";

describe("parseRoundPlan", () => {
  test("parses a valid plan", () => {
    const plan = parseRoundPlan(
      JSON.stringify({
        bid: 1,
        extras: [],
        freeMove: {
          unitId: "u1",
          from: { q: 0, r: 0, s: 0 },
          to: { q: 0, r: 1, s: -1 },
        },
      }),
    );
    expect(plan.bid).toBe(1);
    expect(plan.freeMove?.unitId).toBe("u1");
  });

  test("rejects missing extras", () => {
    expect(() => parseRoundPlan("{\"bid\":0}")).toThrow("missing extras");
  });
});
