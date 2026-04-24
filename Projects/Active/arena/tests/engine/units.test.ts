import { describe, it, expect } from "bun:test";
import { createUnit, placeStartingUnits } from "../../src/engine/units.ts";
import { initBoard } from "../../src/engine/board.ts";
import type { HexCell, Unit } from "../../src/shared/types.ts";

function collectUnits(board: HexCell[][]): Unit[] {
  const units: Unit[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell.unit) units.push(cell.unit);
    }
  }
  return units;
}

function mirrorQ(c: { q: number; r: number; s: number }) {
  return { q: -c.q, r: c.r, s: -c.s };
}

describe("createUnit", () => {
  it("creates a unit with correct owner, position, and type", () => {
    const pos = { q: 1, r: -2, s: 1 };
    const unit = createUnit("A", pos, "infantry");
    expect(unit.owner).toBe("A");
    expect(unit.position).toEqual(pos);
    expect(unit.type).toBe("infantry");
    expect(unit.hp).toBe(5);
    expect(unit.strength).toBe(3);
    expect(unit.weight).toBe(2);
  });

  it("assigns weight scout=1, infantry=2, heavy=3", () => {
    const pos = { q: 0, r: 0, s: 0 };
    expect(createUnit("A", pos, "scout").weight).toBe(1);
    expect(createUnit("A", pos, "infantry").weight).toBe(2);
    expect(createUnit("A", pos, "heavy").weight).toBe(3);
  });

  it("weight stable across repeated calls", () => {
    const pos = { q: 2, r: -1, s: -1 };
    const a = createUnit("B", pos, "heavy");
    const b = createUnit("B", pos, "heavy");
    expect(a.weight).toBe(b.weight);
  });

  it("different owners produce different ids", () => {
    const pos = { q: 0, r: 0, s: 0 };
    const aUnit = createUnit("A", pos, "scout");
    const bUnit = createUnit("B", pos, "scout");
    expect(aUnit.id).not.toBe(bUnit.id);
  });

  it("each unit type has correct stats", () => {
    const pos = { q: 0, r: 0, s: 0 };
    expect(createUnit("A", pos, "infantry").hp).toBe(5);
    expect(createUnit("A", pos, "infantry").strength).toBe(3);
    expect(createUnit("A", pos, "scout").hp).toBe(3);
    expect(createUnit("A", pos, "scout").strength).toBe(2);
    expect(createUnit("A", pos, "heavy").hp).toBe(8);
    expect(createUnit("A", pos, "heavy").strength).toBe(5);
  });
});

describe("placeStartingUnits", () => {
  it("places exactly 3 units per side", () => {
    const board = initBoard(9, 42);
    placeStartingUnits(board);
    const units = collectUnits(board);
    expect(units.filter((u) => u.owner === "A")).toHaveLength(3);
    expect(units.filter((u) => u.owner === "B")).toHaveLength(3);
  });

  it("each side has exactly 3 units — AC1", () => {
    const board = initBoard(9, 99);
    placeStartingUnits(board);
    const units = collectUnits(board);
    const aUnits = units.filter((u) => u.owner === "A");
    const bUnits = units.filter((u) => u.owner === "B");
    expect(aUnits).toHaveLength(3);
    expect(bUnits).toHaveLength(3);
  });

  it("A units are on negative-q flank (q < 0)", () => {
    const board = initBoard(9, 1);
    placeStartingUnits(board);
    const aUnits = collectUnits(board).filter((u) => u.owner === "A");
    for (const u of aUnits) {
      expect(u.position.q).toBeLessThan(0);
    }
  });

  it("B units are on positive-q flank (q > 0)", () => {
    const board = initBoard(9, 1);
    placeStartingUnits(board);
    const bUnits = collectUnits(board).filter((u) => u.owner === "B");
    for (const u of bUnits) {
      expect(u.position.q).toBeGreaterThan(0);
    }
  });

  it("positions are mirror-symmetric across q-axis midline — AC2", () => {
    const board = initBoard(9, 1);
    placeStartingUnits(board);
    const units = collectUnits(board);
    const aUnits = units.filter((u) => u.owner === "A");
    const bUnits = units.filter((u) => u.owner === "B");

    for (const a of aUnits) {
      const m = mirrorQ(a.position);
      const match = bUnits.find(
        (b) => b.position.q === m.q && b.position.r === m.r && b.position.s === m.s,
      );
      expect(match).toBeDefined();
    }
  });

  it("placements are deterministic — same seed gives identical units", () => {
    const board1 = initBoard(9, 12345);
    const board2 = initBoard(9, 12345);
    placeStartingUnits(board1);
    placeStartingUnits(board2);
    const u1 = collectUnits(board1).sort((a, b) => a.id.localeCompare(b.id));
    const u2 = collectUnits(board2).sort((a, b) => a.id.localeCompare(b.id));
    expect(u1).toEqual(u2);
  });

  it("all 3 unit types appear somewhere across both sides", () => {
    const board = initBoard(9, 7);
    placeStartingUnits(board);
    const types = new Set(collectUnits(board).map((u) => u.type));
    expect(types.has("infantry")).toBe(true);
    expect(types.has("scout")).toBe(true);
    expect(types.has("heavy")).toBe(true);
  });
});