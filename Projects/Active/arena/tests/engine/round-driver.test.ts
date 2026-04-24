import { describe, it, expect } from "bun:test";
import { runRound } from "../../src/engine/roundDriver";
import type {
  MatchState,
  Unit,
  HexCell,
  AgentRoundBudget,
  RoundPlan,
  CubeCoord,
} from "../../src/shared/types";

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
  };
}

function budget(apPool = 3): AgentRoundBudget {
  return { freeMove: 1, freeAction: 1, apPool, apCarry: 0 };
}

function passPlan(bid = 0): RoundPlan {
  return { bid, extras: [] };
}

describe("runRound", () => {
  it("advances turn by 1", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const r = runRound({
      matchId: "m-x", round: 7, state,
      planA: passPlan(), planB: passPlan(),
      budgetA: budget(), budgetB: budget(),
    });
    expect(r.nextState.turn).toBe(8);
  });

  it("bid tie is deterministic for same matchId+round", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const r1 = runRound({ matchId: "m-tie", round: 2, state, planA: passPlan(1), planB: passPlan(1), budgetA: budget(), budgetB: budget() });
    const r2 = runRound({ matchId: "m-tie", round: 2, state, planA: passPlan(1), planB: passPlan(1), budgetA: budget(), budgetB: budget() });
    expect(r1.nextBudgetA.apPool).toBe(r2.nextBudgetA.apPool);
    expect(r1.nextBudgetB.apPool).toBe(r2.nextBudgetB.apPool);
  });

  it("higher bid deducts AP first", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const r = runRound({
      matchId: "m", round: 0, state,
      planA: { bid: 2, extras: [] },
      planB: { bid: 0, extras: [] },
      budgetA: budget(3), budgetB: budget(3),
    });
    // A spent 2, refunded 2 (unused slots) up to AP_CAP=4
    expect(r.nextBudgetA.apPool).toBeLessThanOrEqual(4);
    expect(r.nextBudgetB.apPool).toBeLessThanOrEqual(4);
  });

  it("freeMove moves unit to new coord", () => {
    const state = mkState(
      [unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))],
      [cube(1, 0)],
    );
    const r = runRound({
      matchId: "m", round: 0, state,
      planA: { bid: 0, extras: [], freeMove: { unitId: "a1", from: cube(0, 0), to: cube(1, 0) } },
      planB: passPlan(),
      budgetA: budget(), budgetB: budget(),
    });
    const moved = r.nextState.units.find((u) => u.id === "a1")!;
    expect(moved.position).toEqual(cube(1, 0));
    expect(r.events.some((e) => e.type === "unit_moved")).toBe(true);
  });

  it("freeAction attack emits unit_attacked", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(1, 0))]);
    const r = runRound({
      matchId: "m", round: 0, state,
      planA: { bid: 0, extras: [], freeAction: { unitId: "a1", type: "attack", from: cube(0, 0), to: cube(1, 0) } },
      planB: passPlan(),
      budgetA: budget(), budgetB: budget(),
    });
    expect(r.events.some((e) => e.type === "unit_attacked")).toBe(true);
  });

  it("retarget fires when winner removes target before loser attacks", () => {
    // A has higher bid so A first; A kills B's unit at (1,0); B's attack target vanishes; retarget null → no attack event from B
    const state = mkState([
      unit("a1", "A", cube(0, 0), "heavy"),
      unit("b1", "B", cube(1, 0)),
    ]);
    const r = runRound({
      matchId: "m", round: 0, state,
      planA: { bid: 2, extras: [], freeAction: { unitId: "a1", type: "attack", from: cube(0, 0), to: cube(1, 0) } },
      planB: { bid: 0, extras: [], freeAction: { unitId: "b1", type: "attack", from: cube(1, 0), to: cube(0, 0) } },
      budgetA: budget(3), budgetB: budget(3),
    });
    // A wins bid (2 > 0), heavy strength 5 ≥ infantry hp 5 → b1 destroyed
    // B's b1 is gone, so B's attack skipped entirely
    const destroyed = r.events.filter((e) => e.type === "unit_destroyed");
    expect(destroyed.length).toBeGreaterThanOrEqual(1);
  });

  it("emits slots_refunded when agent uses neither slot", () => {
    const state = mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const r = runRound({
      matchId: "m", round: 0, state,
      planA: passPlan(), planB: passPlan(),
      budgetA: budget(1), budgetB: budget(1),
    });
    const refunds = r.events.filter((e) => e.type === "slots_refunded");
    expect(refunds.length).toBe(2);
  });

  it("purity: identical inputs yield identical outputs", () => {
    const mk = () => mkState([unit("a1", "A", cube(0, 0)), unit("b1", "B", cube(3, 0))]);
    const input = (): Parameters<typeof runRound>[0] => ({
      matchId: "pure", round: 0, state: mk(),
      planA: passPlan(), planB: passPlan(),
      budgetA: budget(), budgetB: budget(),
    });
    const a = runRound(input());
    const b = runRound(input());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("ended=true when victory condition is met", () => {
    // Kill all B units → elimination
    const state = mkState([unit("a1", "A", cube(0, 0), "heavy"), unit("b1", "B", cube(1, 0))]);
    const r = runRound({
      matchId: "m", round: 0, state,
      planA: { bid: 2, extras: [], freeAction: { unitId: "a1", type: "attack", from: cube(0, 0), to: cube(1, 0) } },
      planB: passPlan(),
      budgetA: budget(3), budgetB: budget(3),
    });
    expect(r.ended).toBe(true);
  });
});
