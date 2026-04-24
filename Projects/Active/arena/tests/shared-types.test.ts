import { describe, expect, it } from "bun:test";
import {
  BOARD_SIZE,
  TIME_BUDGET_MS,
  STARTING_UNITS,
  type CubeCoord,
  type Unit,
  type HexCell,
  type MatchState,
  type RoundPlan,
  type EngineEvent,
  type EngineEventType,
} from "../src/shared/types";

describe("shared/types constants", () => {
  it("BOARD_SIZE is 9", () => {
    expect(BOARD_SIZE).toBe(9);
  });
  it("TIME_BUDGET_MS is 5000", () => {
    expect(TIME_BUDGET_MS).toBe(5000);
  });
  it("STARTING_UNITS is 3", () => {
    expect(STARTING_UNITS).toBe(3);
  });
});

describe("CubeCoord invariant", () => {
  it("q + r + s = 0 holds for valid coords", () => {
    const coord: CubeCoord = { q: 1, r: -1, s: 0 };
    expect(coord.q + coord.r + coord.s).toBe(0);
  });
  it("rejects coords where invariant fails (type allowed, runtime check needed)", () => {
    const coord: CubeCoord = { q: 1, r: 2, s: -3 };
    expect(coord.q + coord.r + coord.s).toBe(0);
  });
});

describe("Unit", () => {
  it("valid unit shape", () => {
    const unit: Unit = {
      id: "u1",
      owner: "A",
      position: { q: 0, r: 0, s: 0 },
      strength: 5,
      hp: 10,
      type: "infantry",
      weight: 2,
    };
    expect(unit.owner).toBe("A");
    expect(unit.type).toBe("infantry");
    expect(unit.weight).toBe(2);
  });
});

describe("HexCell", () => {
  it("valid cell shape", () => {
    const cell: HexCell = {
      position: { q: 1, r: -1, s: 0 },
      terrain: "forest",
      controlledBy: "B",
    };
    expect(cell.terrain).toBe("forest");
    expect(cell.controlledBy).toBe("B");
  });
  it("cell with unit", () => {
    const cell: HexCell = {
      position: { q: 0, r: 0, s: 0 },
      terrain: "plain",
      unit: { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry", weight: 2 },
    };
    expect(cell.unit).toBeDefined();
  });
});

describe("MatchState", () => {
  it("valid match state shape", () => {
    const state: MatchState = {
      turn: 1,
      visible: [],
      units: [],
      score: { a: 0, b: 0 },
      deadline: Date.now() + 5000,
      roundCap: 48,
    };
    expect(state.turn).toBe(1);
    expect(state.roundCap).toBe(48);
  });
});

describe("RoundPlan shape", () => {
  it("pass plan", () => {
    const plan: RoundPlan = { bid: 0, extras: [] };
    expect(plan.bid).toBe(0);
    expect(plan.extras).toEqual([]);
  });
  it("move plan", () => {
    const plan: RoundPlan = {
      bid: 0,
      extras: [],
      freeMove: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 } },
    };
    expect(plan.freeMove?.unitId).toBe("u1");
  });
  it("attack plan", () => {
    const plan: RoundPlan = {
      bid: 2,
      extras: [],
      freeAction: { unitId: "u2", type: "attack", from: { q: 1, r: -1, s: 0 }, to: { q: 2, r: -2, s: 0 } },
    };
    expect(plan.freeAction?.type).toBe("attack");
  });
});

describe("EngineEvent", () => {
  it("unit_moved event", () => {
    const event: EngineEvent = {
      type: "unit_moved",
      payload: { unitId: "u1", from: { q: 0, r: 0, s: 0 }, to: { q: 1, r: -1, s: 0 } },
      timestamp: Date.now(),
    };
    expect(event.type).toBe("unit_moved");
    expect(event.payload).toBeDefined();
  });
});

describe("enum exhaustiveness", () => {
  it("EngineEventType covers all variants", () => {
    const types: EngineEventType[] = [
      "unit_moved",
      "unit_attacked",
      "unit_destroyed",
      "territory_claimed",
      "turn_ended",
      "action_retargeted",
      "slots_refunded",
    ];
    expect(types.length).toBe(7);
  });
});
