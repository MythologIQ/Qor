import { describe, it, expect } from "bun:test";
import { advanceTurn } from "../../src/engine/turns.ts";
import type { MatchState, AgentAction, Unit } from "../../src/shared/types.ts";

const BOARD_SIZE = 9;

function makeCell(q: number, r: number, s: number, terrain = "plain") {
  return { position: { q, r, s }, terrain };
}

function makeUnit(id: string, owner: "A" | "B", q: number, r: number, s: number): Unit {
  return { id, owner, position: { q, r, s }, strength: 5, hp: 5, type: "infantry" };
}

function makeState(units: Unit[], yourTurn = true): MatchState {
  const visible: MatchState["visible"] = [];
  for (let q = -BOARD_SIZE + 1; q < BOARD_SIZE; q++) {
    for (let r = -BOARD_SIZE + 1; r < BOARD_SIZE; r++) {
      const s = -q - r;
      if (Math.abs(s) < BOARD_SIZE) {
        visible.push(makeCell(q, r, s, "plain"));
      }
    }
  }
  // patch water cell at origin
  const waterIdx = visible.findIndex(c => c.position.q === 0 && c.position.r === 0);
  if (waterIdx !== -1) visible[waterIdx] = { ...visible[waterIdx], terrain: "water" };

  return { turn: 1, yourTurn, visible, units, score: { a: 0, b: 0 }, deadline: Date.now() + 5000 };
}

function action(type: AgentAction["type"], from: { q: number; r: number; s: number }, to: { q: number; r: number; s: number }): AgentAction {
  return { type, from, to, confidence: 1.0 };
}

describe("advanceTurn — single moves", () => {
  it("applies a single move for agent A", () => {
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)]);
    const result = advanceTurn(state, action("move", { q: 0, r: -1, s: 1 }, { q: 1, r: -1, s: 0 }), { type: "pass" });
    const moved = result.units.find(u => u.id === "u1")!;
    expect(moved.position).toEqual({ q: 1, r: -1, s: 0 });
  });

  it("applies a single move for agent B when it is B's turn", () => {
    // During B's turn (yourTurn=false), A's pass is filtered and B's move applies
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)], false);
    const result = advanceTurn(state, { type: "pass" }, action("move", { q: 2, r: -1, s: -1 }, { q: 1, r: -1, s: 0 }));
    const moved = result.units.find(u => u.id === "u2")!;
    expect(moved.position).toEqual({ q: 1, r: -1, s: 0 });
  });

  it("increments turn counter", () => {
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)]);
    const result = advanceTurn(state, action("move", { q: 0, r: -1, s: 1 }, { q: 1, r: -1, s: 0 }), { type: "pass" });
    expect(result.turn).toBe(2);
  });

  it("switches yourTurn", () => {
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)]);
    const result = advanceTurn(state, { type: "pass" }, action("move", { q: 2, r: -1, s: -1 }, { q: 1, r: -1, s: 0 }));
    expect(result.yourTurn).toBe(false);
  });

  it("move into water is blocked", () => {
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)]);
    const result = advanceTurn(state, action("move", { q: 0, r: -1, s: 1 }, { q: 0, r: 0, s: 0 }), { type: "pass" });
    const moved = result.units.find(u => u.id === "u1")!;
    expect(moved.position).toEqual({ q: 0, r: -1, s: 1 });
  });
});

describe("advanceTurn — same target conflict", () => {
  it("both moves to same cell both fail", () => {
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)]);
    const result = advanceTurn(
      state,
      action("move", { q: 0, r: -1, s: 1 }, { q: 1, r: -1, s: 0 }),
      action("move", { q: 2, r: -1, s: -1 }, { q: 1, r: -1, s: 0 })
    );
    expect(result.units.find(u => u.id === "u1")!.position).toEqual({ q: 0, r: -1, s: 1 });
    expect(result.units.find(u => u.id === "u2")!.position).toEqual({ q: 2, r: -1, s: -1 });
  });
});

describe("advanceTurn — two moves, different targets", () => {
  it("A's move succeeds in A's turn, B's move succeeds in B's turn", () => {
    // Test two-turn sequence: A moves on turn N, B moves on turn N+1
    const state = makeState([makeUnit("u1", "A", 0, -1, 1), makeUnit("u2", "B", 2, -1, -1)]);

    // A's turn: yourTurn=true → A moves
    const afterA = advanceTurn(state,
      action("move", { q: 0, r: -1, s: 1 }, { q: 1, r: -1, s: 0 }),
      { type: "pass" }
    );
    expect(afterA.units.find(u => u.id === "u1")!.position).toEqual({ q: 1, r: -1, s: 0 });
    // u2 is B's unit — not moved this turn (yourTurn was true)
    expect(afterA.units.find(u => u.id === "u2")!.position).toEqual({ q: 2, r: -1, s: -1 });

    // B's turn: yourTurn=false → B moves
    const afterB = advanceTurn(afterA,
      { type: "pass" },
      action("move", { q: 2, r: -1, s: -1 }, { q: 3, r: -1, s: -2 })
    );
    expect(afterB.units.find(u => u.id === "u2")!.position).toEqual({ q: 3, r: -1, s: -2 });
  });
});
