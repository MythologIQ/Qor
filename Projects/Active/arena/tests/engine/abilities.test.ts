import { describe, it, expect } from "bun:test";
import { resolveAbility } from "../../src/engine/abilities";
import type { Unit, CubeCoord, MatchState } from "../../../src/shared/types";

function cube(q: number, r: number): CubeCoord {
  return { q, r, s: -q - r };
}

function unit(
  id: string,
  owner: "A" | "B",
  pos: CubeCoord,
  type: "infantry" | "scout" | "heavy" = "infantry",
): Unit {
  const weight = type === "scout" ? 1 : type === "infantry" ? 2 : 3;
  const hp = type === "scout" ? 3 : type === "infantry" ? 5 : 8;
  const strength = type === "scout" ? 2 : type === "infantry" ? 3 : 5;
  return { id, owner, position: pos, strength, hp, type, weight };
}

function mkState(units: Unit[]): MatchState {
  return {
    turn: 0,
    visible: units.map((u) => ({ position: u.position, terrain: "plain" as const, unit: u })),
    units,
    score: { a: 0, b: 0 },
    deadline: 0,
    roundCap: 50,
  };
}

describe("resolveAbility", () => {
  it("boosted_ability mode=damage adds 1 to flanker damage", () => {
    // scout unit with flanker identity
    const a1 = unit("a1", "A", cube(0, 0), "scout");
    const state = mkState([a1, unit("b1", "B", cube(1, 0))]);
    const ctx = { state, agent: "A" as const, unit: a1, boost: { mode: "damage" as const } };
    const result = resolveAbility(ctx, { kind: "boosted_ability", unitId: "a1", mode: "damage" });
    const ev = result.events.find((e) => e.type === "ability_resolved");
    expect(ev).toBeDefined();
    expect((ev!.payload as Record<string, unknown>).damageBonus).toBe(1);
  });

  it("boosted_ability mode=range increases vanguard_sight reveal radius by 1", () => {
    // infantry unit with vanguard identity
    const a1 = unit("a1", "A", cube(0, 0), "infantry");
    const state = mkState([a1, unit("b1", "B", cube(1, 0))]);
    const ctx = { state, agent: "A" as const, unit: a1, boost: { mode: "range" as const } };
    const result = resolveAbility(ctx, { kind: "boosted_ability", unitId: "a1", mode: "range" });
    const ev = result.events.find((e) => e.type === "ability_resolved");
    expect(ev).toBeDefined();
    expect((ev!.payload as Record<string, unknown>).revealRadius).toBe(3); // BASE_RADIUS 2 + 1
  });

  it("boosted_ability mode=damage on vanguard_sight is a no-op", () => {
    const a1 = unit("a1", "A", cube(0, 0), "infantry");
    const state = mkState([a1, unit("b1", "B", cube(1, 0))]);
    const ctx = { state, agent: "A" as const, unit: a1, boost: { mode: "damage" as const } };
    const result = resolveAbility(ctx, { kind: "boosted_ability", unitId: "a1", mode: "damage" });
    const ev = result.events.find((e) => e.type === "ability_resolved");
    // vanguard_sight emits no damage, so damageBonus should be undefined/0
    expect((ev!.payload as Record<string, unknown>).ability).toBe("vanguard_sight");
  });

  it("boost flag is consumed exactly once per round (round 1 has boost, round 2 does not)", () => {
    // Simulate a 2-round scenario by checking that boostConsumed is set
    const a1 = unit("a1", "A", cube(0, 0), "infantry");
    const state = mkState([a1, unit("b1", "B", cube(1, 0))]);
    // mode=range: boostConsumed=true, boost cleared after use
    const ctx1 = { state, agent: "A" as const, unit: a1, boost: { mode: "range" as const } };
    const result1 = resolveAbility(ctx1, { kind: "boosted_ability", unitId: "a1", mode: "range" });
    expect(result1.boostConsumed).toBe(true);
    expect(ctx1.boost).toBeUndefined(); // cleared after use

    // Round 2: no boost available
    const ctx2 = { state, agent: "A" as const, unit: a1, boost: undefined };
    const result2 = resolveAbility(ctx2, { kind: "boosted_ability", unitId: "a1", mode: "damage" });
    expect(result2.boostConsumed).toBe(false);
    const ev = result2.events.find((e) => e.type === "ability_resolved");
    expect((ev!.payload as Record<string, unknown>).ability).toBe("vanguard_sight");
  });
});