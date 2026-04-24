import { describe, expect, test } from "bun:test";
import { listPolicyPacks } from "../../src/house-agents/policy-pack.ts";

describe("policy packs", () => {
  test("share a single model id and ascending horizons", () => {
    const packs = listPolicyPacks();
    expect(new Set(packs.map((pack) => pack.modelId)).size).toBe(1);
    expect(packs.map((pack) => pack.planningHorizon)).toEqual([1, 2, 3]);
  });

  test("contain no empty doctrine sections", () => {
    const packs = listPolicyPacks();
    for (const pack of packs) {
      for (const value of Object.values(pack.doctrine)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
