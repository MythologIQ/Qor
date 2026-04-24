import { describe, it, expect, beforeEach } from "bun:test";
import {
  resolveExtras,
  resolveBoostedAbility,
  resolveSecondAttack,
  recordDefensiveStance,
  recordReserveOverwatch,
  type ExtrasContext,
} from "../../../src/engine/round-resolver/extras";
import type {
  MatchState,
  Unit,
  CubeCoord,
  HexCell,
  RoundPlan,
  ExtraEntry,
} from "../../../src/shared/types";

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

function plainCell(pos: CubeCoord, u?: Unit): HexCell {
  return { position: pos, terrain: "plain", ...(u ? { unit: u } : {}) };
}

function mkState(units: Unit[], extraCells: CubeCoord[] = []): MatchState {
  const cells: HexCell[] = [];
  for (const u of units) cells.push(plainCell(u.position, u));
  for (const p of extraCells) {
    if (!cells.find((c) => c.position.q === p.q && c.position.r === p.r)) {
      cells.push(plainCell(p));
    }
  }
  return {
    turn: 0,
    visible: cells,
    units,
    score: { a: 0, b: 0 },
    deadline: 0,
    roundCap: 50,
    stances: [],
    reserves: [],
  };
}

function mkCtx(
  state: MatchState,
  round = 1,
  bidWinner: "A" | "B" = "A",
  planA: RoundPlan,
  planB: RoundPlan,
): ExtrasContext {
  return {
    state,
    round,
    bidWinner,
    boostFlag: {},
    events: [],
    planA,
    planB,
  };
}

describe("resolveExtras", () => {
  it("processes winner's extras before loser's extras", () => {
    const a1 = unit("a1", "A", cube(0, 0));
    const b1 = unit("b1", "B", cube(3, 0));
    const state = mkState([a1, b1], [cube(1, 0), cube(2, 0)]);

    const planA: RoundPlan = {
      bid: 0,
      extras: [
        { kind: "defensive_stance", unitId: "a1" },
      ],
    };
    const planB: RoundPlan = {
      bid: 0,
      extras: [
        { kind: "defensive_stance", unitId: "b1" },
      ],
    };
    const ctx = mkCtx(state, 1, "A", planA, planB);
    resolveExtras(ctx);

    // A's stance comes before B's in event order (winner first)
    const stanceEvents = ctx.events.filter((e) => e.type === "stance_recorded");
    expect(stanceEvents.length).toBe(2);
    const aIdx = ctx.events.indexOf(stanceEvents[0]);
    const bIdx = ctx.events.indexOf(stanceEvents[1]);
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("processes extras in their declared order within each plan", () => {
    const a1 = unit("a1", "A", cube(0, 0));
    const state = mkState([a1, unit("b1", "B", cube(3, 0))]);

    const planA: RoundPlan = {
      bid: 0,
      extras: [
        { kind: "defensive_stance", unitId: "a1" },
        { kind: "reserve_overwatch", unitId: "a1" },
      ],
    };
    const ctx = mkCtx(state, 1, "A", planA, { bid: 0, extras: [] });
    resolveExtras(ctx);

    const stanceIdx = ctx.events.findIndex((e) => e.type === "stance_recorded");
    const reserveIdx = ctx.events.findIndex((e) => e.type === "reserve_recorded");
    expect(stanceIdx).toBeLessThan(reserveIdx);
  });
});

describe("resolveBoostedAbility", () => {
  it("sets boostFlag for agent", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const ctx = mkCtx(state, 1, "A", { bid: 0, extras: [] }, { bid: 0, extras: [] });
    resolveBoostedAbility(ctx, "A", { kind: "boosted_ability", unitId: "a1", mode: "damage" });
    expect(ctx.boostFlag["A"]).toEqual({ mode: "damage" });
    expect(ctx.events.some((e) => e.type === "boost_applied")).toBe(true);
  });

  it("sets mode=range from extra.mode", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const ctx = mkCtx(state, 1, "A", { bid: 0, extras: [] }, { bid: 0, extras: [] });
    resolveBoostedAbility(ctx, "A", { kind: "boosted_ability", unitId: "a1", mode: "range" });
    expect(ctx.boostFlag["A"]).toEqual({ mode: "range" });
  });
});

describe("resolveSecondAttack", () => {
  it("emits unit_attacked when original target is present", () => {
    const a1 = unit("a1", "A", cube(0, 0), "heavy");
    const b1 = unit("b1", "B", cube(1, 0));
    const state = mkState([a1, b1]);
    const ctx = mkCtx(
      state,
      1,
      "A",
      { bid: 0, extras: [] },
      { bid: 0, extras: [{ kind: "second_attack", unitId: "a1", to: cube(1, 0) }] },
    );

    resolveSecondAttack(ctx, "A", { kind: "second_attack", unitId: "a1", to: cube(1, 0) });

    const attackEv = ctx.events.find((e) => e.type === "unit_attacked");
    expect(attackEv).toBeDefined();
    expect((attackEv!.payload as Record<string, unknown>).attackerUnitId).toBe("a1");
  });

  it("emits action_retargeted when original target moved (rushed shot)", () => {
    const a1 = unit("a1", "A", cube(0, 0), "heavy");
    const b1 = unit("b1", "B", cube(1, 0));
    const state = mkState([a1, b1]);
    // Move b1 to a new position still within heavy's range (range=2)
    // so the G1 retarget rule picks it as rushed-shot candidate.
    b1.position = cube(2, 0);
    const state2: MatchState = {
      ...state,
      visible: state.visible.map((c) => {
        if (c.position.q === 1 && c.position.r === 0) return { ...c, position: cube(2, 0), unit: b1 };
        return c;
      }),
    };
    const ctx = mkCtx(
      state2,
      1,
      "A",
      { bid: 0, extras: [] },
      { bid: 0, extras: [{ kind: "second_attack", unitId: "a1", to: cube(1, 0) }] },
    );

    resolveSecondAttack(ctx, "A", { kind: "second_attack", unitId: "a1", to: cube(1, 0) });

    const retargetEv = ctx.events.find((e) => e.type === "action_retargeted");
    expect(retargetEv).toBeDefined();
    expect((retargetEv!.payload as Record<string, unknown>).reason).toBe("rushed_shot");
  });

  it("emits action_wasted when no target in range", () => {
    const a1 = unit("a1", "A", cube(0, 0), "heavy");
    const b1 = unit("b1", "B", cube(5, 0)); // out of heavy range (range 2)
    const state = mkState([a1, b1]);
    const ctx = mkCtx(
      state,
      1,
      "A",
      { bid: 0, extras: [] },
      { bid: 0, extras: [{ kind: "second_attack", unitId: "a1", to: cube(5, 0) }] },
    );

    resolveSecondAttack(ctx, "A", { kind: "second_attack", unitId: "a1", to: cube(5, 0) });

    const wastedEv = ctx.events.find((e) => e.type === "action_wasted");
    expect(wastedEv).toBeDefined();
    expect((wastedEv!.payload as Record<string, unknown>).reason).toBe("no_target_in_range");
  });

  it("uses rushed shot damage floor(strength/2) for heavy unit", () => {
    const a1 = unit("a1", "A", cube(0, 0), "heavy"); // strength 5
    // Place b1 at (2,0) — within heavy range (range=2) but not at the
    // declared target (1,0), triggering rushed-shot retarget.
    const b1 = unit("b1", "B", cube(2, 0));
    const state = mkState([a1, b1]);
    const ctx = mkCtx(
      state,
      1,
      "A",
      { bid: 0, extras: [] },
      { bid: 0, extras: [{ kind: "second_attack", unitId: "a1", to: cube(1, 0) }] },
    );

    resolveSecondAttack(ctx, "A", { kind: "second_attack", unitId: "a1", to: cube(1, 0) });

    const retargetEv = ctx.events.find((e) => e.type === "action_retargeted");
    expect(retargetEv).toBeDefined();
    // heavy strength 5 → floor(5/2) = 2
    expect((retargetEv!.payload as Record<string, unknown>).damage).toBe(2);
  });
});

describe("recordDefensiveStance", () => {
  it("appends StanceRecord with appliesOnRound = currentRound + 1", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const ctx = mkCtx(state, 5, "A", { bid: 0, extras: [] }, { bid: 0, extras: [] });

    recordDefensiveStance(ctx, "A", { kind: "defensive_stance", unitId: "a1" });

    expect(state.stances).toBeDefined();
    expect(state.stances!.length).toBe(1);
    expect(state.stances![0].unitId).toBe("a1");
    expect(state.stances![0].appliesOnRound).toBe(6);
    expect(ctx.events.some((e) => e.type === "stance_recorded")).toBe(true);
  });
});

describe("recordReserveOverwatch", () => {
  it("appends ReserveRecord with appliesOnRound = currentRound + 1 and fired = false", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const ctx = mkCtx(state, 3, "A", { bid: 0, extras: [] }, { bid: 0, extras: [] });

    recordReserveOverwatch(ctx, "A", { kind: "reserve_overwatch", unitId: "a1" });

    expect(state.reserves).toBeDefined();
    expect(state.reserves!.length).toBe(1);
    expect(state.reserves![0].unitId).toBe("a1");
    expect(state.reserves![0].ownerId).toBe("A");
    expect(state.reserves![0].appliesOnRound).toBe(4);
    expect(state.reserves![0].fired).toBe(false);
    expect(ctx.events.some((e) => e.type === "reserve_recorded")).toBe(true);
  });
});