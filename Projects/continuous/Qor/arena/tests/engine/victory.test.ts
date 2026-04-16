import { describe, it, expect } from "bun:test";
import { checkVictory } from "../../src/engine/victory.ts";
import type { MatchState, Unit, HexCell } from "../../src/shared/types.ts";

function makeUnit(owner: "A" | "B", id: string): Unit {
  return { id, owner, type: "infantry", hp: 10, maxHp: 10, position: { q: 0, r: 0, s: 0 }, strength: 5 };
}

function makeCell(owner: "A" | "B" | null = null): HexCell {
  return {
    position: { q: 0, r: 0, s: 0 },
    terrain: "plain",
    controlledBy: owner ?? undefined,
  };
}

function makeState(overrides: Partial<MatchState>): MatchState {
  return {
    units: [],
    visible: [],
    turn: 1,
    yourTurn: true,
    score: { a: 0, b: 0 },
    deadline: 0,
    ...overrides,
  };
}

describe("checkVictory", () => {
  describe("elimination", () => {
    it("A wins when B has no units", () => {
      const state = makeState({
        units: [makeUnit("A", "a1"), makeUnit("A", "a2")],
        visible: [makeCell(null)],
      });
      const result = checkVictory(state);
      expect(result.winner).toBe("A");
      expect(result.reason).toBe("elimination");
    });

    it("B wins when A has no units", () => {
      const state = makeState({
        units: [makeUnit("B", "b1")],
        visible: [makeCell(null)],
      });
      const result = checkVictory(state);
      expect(result.winner).toBe("B");
      expect(result.reason).toBe("elimination");
    });

    it("draw when both sides have no units", () => {
      const state = makeState({ units: [], visible: [makeCell(null)] });
      const result = checkVictory(state);
      expect(result.winner).toBe("draw");
      expect(result.reason).toBe("mutual_elimination");
    });
  });

  describe("territory control", () => {
    it("60% territory does NOT trigger win without unit elimination", () => {
      const cells: HexCell[] = Array.from({ length: 10 }, (_, i) =>
        makeCell(i < 6 ? "A" : "B")
      );
      const state = makeState({ turn: 10, visible: cells, units: [] });
      const result = checkVictory(state);
      expect(result.winner).toBe("draw");
      expect(result.reason).toBe("mutual_elimination");
    });

    it("A wins via territory when both sides have units and A holds 60%", () => {
      const cells: HexCell[] = Array.from({ length: 10 }, (_, i) =>
        makeCell(i < 6 ? "A" : "B")
      );
      const state = makeState({
        turn: 10,
        visible: cells,
        units: [makeUnit("A", "a1"), makeUnit("B", "b1")],
      });
      const result = checkVictory(state);
      expect(result.winner).toBe("A");
      expect(result.reason).toBe("territory_control");
    });

    it("B wins via territory when both sides have units and B holds 60%", () => {
      const cells: HexCell[] = Array.from({ length: 10 }, (_, i) =>
        makeCell(i < 4 ? "A" : "B")
      );
      const state = makeState({
        turn: 10,
        visible: cells,
        units: [makeUnit("A", "a1"), makeUnit("B", "b1")],
      });
      const result = checkVictory(state);
      expect(result.winner).toBe("B");
      expect(result.reason).toBe("territory_control");
    });
  });

  describe("turn cap", () => {
    it("50-50 at turn 50 is a draw", () => {
      const cells: HexCell[] = Array.from({ length: 10 }, (_, i) =>
        makeCell(i < 5 ? "A" : "B")
      );
      const state = makeState({
        turn: 50,
        visible: cells,
        units: [makeUnit("A", "a1"), makeUnit("B", "b1")],
      });
      const result = checkVictory(state);
      expect(result.winner).toBe("draw");
      expect(result.reason).toBe("turn_cap");
    });

    it("no-contested territory at turn cap returns draw", () => {
      const cells: HexCell[] = Array.from({ length: 10 }, (_, i) =>
        makeCell(i < 5 ? "A" : "B")
      );
      const state = makeState({
        turn: 51,
        visible: cells,
        units: [makeUnit("A", "a1"), makeUnit("B", "b1")],
      });
      const result = checkVictory(state);
      expect(result.winner).toBe("draw");
      expect(result.reason).toBe("turn_cap");
    });
  });
});
