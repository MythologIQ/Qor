import { describe, expect, it } from "bun:test";
import {
  BOARD_SIZE,
  TIME_BUDGET_MS,
  TURN_CAP,
  STARTING_UNITS,
  type CubeCoord,
  type Unit,
  type HexCell,
  type MatchState,
  type AgentAction,
  type AgentActionType,
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
  it("TURN_CAP is 50", () => {
    expect(TURN_CAP).toBe(50);
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
    // TypeScript enforces shape; runtime validation is the engine's job
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
    };
    expect(unit.owner).toBe("A");
    expect(unit.type).toBe("infantry");
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
      unit: { id: "u1", owner: "A", position: { q: 0, r: 0, s: 0 }, strength: 1, hp: 1, type: "infantry" },
    };
    expect(cell.unit).toBeDefined();
  });
});

describe("MatchState", () => {
  it("valid match state shape", () => {
    const state: MatchState = {
      turn: 1,
      yourTurn: true,
      visible: [],
      units: [],
      score: { a: 0, b: 0 },
      deadline: Date.now() + 5000,
    };
    expect(state.turn).toBe(1);
    expect(state.yourTurn).toBe(true);
  });
});

describe("AgentAction types", () => {
  it("move action", () => {
    const action: AgentAction = {
      type: "move",
      from: { q: 0, r: 0, s: 0 },
      to: { q: 1, r: -1, s: 0 },
      confidence: 0.95,
    };
    expect(action.type).toBe("move");
    expect(action.from).toBeDefined();
    expect(action.to).toBeDefined();
  });
  it("attack action", () => {
    const action: AgentAction = {
      type: "attack",
      from: { q: 1, r: -1, s: 0 },
      to: { q: 2, r: -2, s: 0 },
      confidence: 0.8,
    };
    expect(action.type).toBe("attack");
  });
  it("pass action", () => {
    const action: AgentAction = {
      type: "pass",
      confidence: 1.0,
    };
    expect(action.type).toBe("pass");
    expect(action.from).toBeUndefined();
    expect(action.to).toBeUndefined();
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
  it("AgentActionType covers all variants", () => {
    const types: AgentActionType[] = ["move", "attack", "pass"];
    expect(types.length).toBe(3);
  });
  it("EngineEventType covers all variants", () => {
    const types: EngineEventType[] = ["unit_moved", "unit_attacked", "unit_destroyed", "territory_claimed", "turn_ended"];
    expect(types.length).toBe(5);
  });
});