import { describe, test, expect } from "bun:test";
import { adaptSpectatorSnapshot } from "./live-match.ts";
import type { SpectatorSnapshot } from "../orchestrator/match-runner.ts";
import type { MatchState, HexCell, Unit, AgentRoundBudget } from "../shared/types.ts";

function makeCell(q: number, r: number, terrain: HexCell["terrain"] = "plain", controlledBy?: "A" | "B"): HexCell {
  return { position: { q, r, s: -q - r }, terrain, controlledBy };
}

function makeUnit(id: string, owner: "A" | "B", q: number, r: number): Unit {
  return { id, owner, position: { q, r, s: -q - r }, strength: 5, hp: 8, type: "infantry" };
}

function makeSnapshot(overrides: Partial<SpectatorSnapshot> = {}): SpectatorSnapshot {
  const state: MatchState = {
    turn: 3,
    visible: [
      makeCell(0, 0, "plain", "A"),
      makeCell(1, 0, "forest", "A"),
      makeCell(2, 0, "plain"),
      makeCell(-1, 0, "plain", "B"),
      makeCell(-2, 0, "mountain"),
    ],
    units: [makeUnit("u1", "A", 0, 0), makeUnit("u2", "B", -1, 0)],
    score: { a: 2, b: 1 },
    deadline: 5000,
    roundCap: 50,
  };
  return {
    matchId: "test-adapt",
    state,
    budgetA: { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 },
    budgetB: { freeMove: 1, freeAction: 1, apPool: 3, apCarry: 0 },
    round: 3,
    agents: {
      A: { operator: "Blue Op", modelId: "gpt-4o", totalMs: 1200, totalActions: 6, invalidCount: 0 },
      B: { operator: "Red Op", modelId: "claude-3", totalMs: 980, totalActions: 6, invalidCount: 1 },
    },
    events: [
      { type: "unit_moved", payload: { agent: "A", unitId: "u1" }, timestamp: 1 },
      { type: "unit_attacked", payload: { agent: "B", unitId: "u2" }, timestamp: 2 },
    ],
    ...overrides,
  };
}

describe("adaptSpectatorSnapshot", () => {
  test("maps cells to PublicBoardCell", () => {
    const result = adaptSpectatorSnapshot(makeSnapshot());
    expect(result.board.length).toBe(5);
    expect(result.board[0]).toEqual({ q: 0, r: 0, s: 0, terrain: "plain", controlledBy: "A" });
    expect(result.board[4]).toEqual({ q: -2, r: 0, s: 2, terrain: "mountain", controlledBy: null });
  });

  test("maps units to PublicBoardUnit", () => {
    const result = adaptSpectatorSnapshot(makeSnapshot());
    expect(result.units.length).toBe(2);
    expect(result.units[0]).toEqual({ id: "u1", side: "A", q: 0, r: 0, s: 0, hp: 8, strength: 5, type: "infantry", facing: undefined });
  });

  test("computes territories from controlledBy", () => {
    const result = adaptSpectatorSnapshot(makeSnapshot());
    expect(result.territories.A).toBe(2);
    expect(result.territories.B).toBe(1);
  });

  test("computes pressure from territory delta", () => {
    const result = adaptSpectatorSnapshot(makeSnapshot());
    expect(result.pressure).toBeGreaterThan(0);
  });

  test("maps agents with correct fields", () => {
    const result = adaptSpectatorSnapshot(makeSnapshot());
    expect(result.agents!.length).toBe(2);
    expect(result.agents![0].operator).toBe("Blue Op");
    expect(result.agents![0].modelId).toBe("gpt-4o");
    expect(result.agents![1].operator).toBe("Red Op");
  });

  test("maps events to feed entries with correct kinds", () => {
    const result = adaptSpectatorSnapshot(makeSnapshot());
    expect(result.feed!.length).toBe(2);
    expect(result.feed![0].kind).toBe("move");
    expect(result.feed![1].kind).toBe("attack");
  });

  test("empty board produces zero territories", () => {
    const snap = makeSnapshot({
      state: { turn: 0, visible: [], units: [], score: { a: 0, b: 0 }, deadline: 5000, roundCap: 50 },
      events: [],
    });
    const result = adaptSpectatorSnapshot(snap);
    expect(result.territories.A).toBe(0);
    expect(result.territories.B).toBe(0);
    expect(result.pressure).toBe(0);
  });
});
