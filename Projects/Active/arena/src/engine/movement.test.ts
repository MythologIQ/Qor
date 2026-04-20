import { describe, it, expect } from "bun:test";
import type { HexCell } from "../shared/types.ts";
import { cube } from "./coords.ts";
import { canMove, applyMove } from "./movement.ts";
import { createUnit } from "./units.ts";

// board[r][q+4] because r=row index (r=-4..4), q=col index (q=-4..4)
function makeBoard(): HexCell[][] {
  const b: HexCell[][] = [];
  for (let r = -4; r <= 4; r++) {
    const row: HexCell[] = [];
    for (let q = -4; q <= 4; q++) {
      row.push({ position: cube(q, r), terrain: "plain" });
    }
    b.push(row);
  }
  return b;
}

// Helper: get cell ref at cube(q,r) in board
function cellAt(board: HexCell[][], q: number, r: number): HexCell {
  return board[r + 4][q + 4];
}

describe("canMove", () => {
  const board = makeBoard();
  const unitA = createUnit("A", cube(0, 0), "infantry");
  // unitA is at cube(0,0) = board[4][4]

  it("returns true for a valid adjacent plain cell", () => {
    expect(canMove(board, unitA, cube(1, -1))).toBe(true);
  });

  it("returns false for distance 2 (not adjacent)", () => {
    expect(canMove(board, unitA, cube(2, -2))).toBe(false);
  });

  it("returns false for same position", () => {
    expect(canMove(board, unitA, cube(0, 0))).toBe(false);
  });

  it("returns false when target is mountain", () => {
    const b2 = makeBoard();
    cellAt(b2, 1, -1).terrain = "mountain";
    expect(canMove(b2, unitA, cube(1, -1))).toBe(false);
  });

  it("returns false when target is water", () => {
    const b2 = makeBoard();
    cellAt(b2, 1, -1).terrain = "water";
    expect(canMove(b2, unitA, cube(1, -1))).toBe(false);
  });

  it("returns false when target is occupied by friendly unit", () => {
    const b2 = makeBoard();
    cellAt(b2, 1, -1).unit = createUnit("A", cube(1, -1), "scout");
    expect(canMove(b2, unitA, cube(1, -1))).toBe(false);
  });

  it("returns true when target is occupied by enemy unit (attack possible)", () => {
    const b2 = makeBoard();
    cellAt(b2, 1, -1).unit = createUnit("B", cube(1, -1), "scout");
    expect(canMove(b2, unitA, cube(1, -1))).toBe(true);
  });

  it("returns false for off-board coordinate", () => {
    expect(canMove(board, unitA, cube(99, 99))).toBe(false);
  });

  it("returns true for all 6 valid hex neighbors", () => {
    const neighbors = [
      cube(1, -1), cube(1, 0), cube(0, 1),
      cube(-1, 1), cube(-1, 0), cube(0, -1),
    ];
    for (const n of neighbors) {
      expect(canMove(board, unitA, n)).toBe(true);
    }
  });
});

describe("applyMove", () => {
  it("returns a new board and does not mutate the original", () => {
    const board = makeBoard();
    const unit = createUnit("A", cube(0, 0), "infantry");
    cellAt(board, 0, 0).unit = unit;

    const next = applyMove(board, unit, cube(1, -1));

    // Original unchanged
    expect(cellAt(board, 0, 0).unit).toBeDefined();
    expect(cellAt(board, 0, 0).unit!.id).toBe(unit.id);
    // New board has unit at destination
    expect(cellAt(next, 1, -1).unit).toBeDefined();
    expect(cellAt(next, 1, -1).unit!.id).toBe(unit.id);
  });

  it("throws for an invalid move", () => {
    const board = makeBoard();
    const unit = createUnit("A", cube(0, 0), "infantry");
    cellAt(board, 0, 0).unit = unit;

    expect(() => applyMove(board, unit, cube(2, -2))).toThrow();
  });

  it("correctly updates unit position in new board", () => {
    const board = makeBoard();
    const unit = createUnit("A", cube(0, 0), "infantry");
    cellAt(board, 0, 0).unit = unit;

    const next = applyMove(board, unit, cube(-1, 0));

    expect(cellAt(next, -1, 0).unit!.position.q).toBe(-1);
    expect(cellAt(next, -1, 0).unit!.position.r).toBe(0);
  });

  it("leaves all other cells unchanged", () => {
    const board = makeBoard();
    cellAt(board, 1, -1).terrain = "forest";
    const unit = createUnit("A", cube(0, 0), "infantry");
    cellAt(board, 0, 0).unit = unit;

    const next = applyMove(board, unit, cube(1, -1));

    expect(cellAt(next, 1, -1).terrain).toBe("forest");
  });
});
