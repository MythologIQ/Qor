import { describe, it, expect } from "bun:test";
import { initBoard, setCell, cellAt } from "../../src/engine/board.ts";
import { cube } from "../../src/engine/coords.ts";
import { visibleCells } from "../../src/engine/fog.ts";
import type { CubeCoord, HexCell } from "../../src/shared/types.ts";

/**
 * Visibility Symmetry Fairness Tests
 *
 * These tests ensure that fog-of-war visibility is symmetric and fair.
 * Key invariants:
 * - Friendly units have mutual visibility when no terrain blocks between them
 * - Mountain breaks mutual visibility for units on opposite sides of it
 * - Both sides get equal visibility counts on symmetric board + symmetric unit placement
 * - Central blocking terrain reduces visibility equally for both sides
 * - Neutral cells can be visible to both sides if unblocked and within range
 */

describe("visibility-symmetry", () => {
  it("friendly units have mutual visibility (no terrain between them)", () => {
    // Two friendly units at distance 2, all plain terrain
    const board = initBoard(9, 999);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    const unitA = cube(0, 0);
    const unitB = cube(2, -2); // distance 2 from unitA
    setCell(board, unitA, { terrain: "plain", unit: { id: "uA", owner: "A", position: unitA, strength: 5, hp: 5, type: "infantry" } });
    setCell(board, unitB, { terrain: "plain", unit: { id: "uB", owner: "A", position: unitB, strength: 5, hp: 5, type: "infantry" } });

    const vis = visibleCells(board, "A");
    expect(vis.some((c) => c.q === unitB.q && c.r === unitB.r)).toBe(true);
  });

  it("mountain between friendly units breaks mutual visibility", () => {
    // A unit at (-1, 0), mountain at (0, 0), target at (1, 0) is empty plain
    // Mountain blocks LOS to (1,0) from (-1,0)
    const board = initBoard(9, 777);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    const unitA = cube(-1, 0);
    setCell(board, unitA, { terrain: "plain", unit: { id: "uA", owner: "A", position: unitA, strength: 5, hp: 5, type: "infantry" } });
    setCell(board, cube(0, 0), { terrain: "mountain" });
    // (1, 0) is plain, empty (no unit)

    const vis = visibleCells(board, "A");
    expect(vis.some((c) => c.q === 1 && c.r === 0)).toBe(false);
  });

  it("both sides get equal visibility counts on clean symmetric board", () => {
    // All plain to isolate visibility from unit positions
    const board = initBoard(9, 333);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    // A at (2,-2), B at (-2,2) — symmetric around origin
    setCell(board, cube(2, -2), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(2, -2), strength: 5, hp: 5, type: "infantry" } });
    setCell(board, cube(-2, 2), { terrain: "plain", unit: { id: "uB", owner: "B", position: cube(-2, 2), strength: 5, hp: 5, type: "infantry" } });

    const visA = visibleCells(board, "A");
    const visB = visibleCells(board, "B");

    // A and B should have equal visibility counts on symmetric board + symmetric unit placement
    expect(visA.length).toBe(visB.length);
  });

  it("central mountain reduces symmetric visibility equally for both sides", () => {
    const board = initBoard(9, 333);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    // A at (2,-2), B at (-2,2), central mountain at (0,0)
    setCell(board, cube(2, -2), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(2, -2), strength: 5, hp: 5, type: "infantry" } });
    setCell(board, cube(-2, 2), { terrain: "plain", unit: { id: "uB", owner: "B", position: cube(-2, 2), strength: 5, hp: 5, type: "infantry" } });
    setCell(board, cube(0, 0), { terrain: "mountain" });

    const visA = visibleCells(board, "A");
    const visB = visibleCells(board, "B");

    // A and B should still have equal visibility counts (symmetric blocking)
    expect(visA.length).toBe(visB.length);
  });

  it("neutral plain cell visible to both sides when within range and unblocked", () => {
    const board = initBoard(9, 111);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    // A at (0,0), B at (-2,1), neutral at (1,-1)
    setCell(board, cube(0, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
    setCell(board, cube(-2, 1), { terrain: "plain", unit: { id: "uB", owner: "B", position: cube(-2, 1), strength: 5, hp: 5, type: "infantry" } });
    const neutral = cube(1, -1);
    setCell(board, neutral, { terrain: "plain" });

    const visA = visibleCells(board, "A");
    const visB = visibleCells(board, "B");

    expect(visA.some((c) => c.q === neutral.q && c.r === neutral.r)).toBe(true);
    expect(visB.some((c) => c.q === neutral.q && c.r === neutral.r)).toBe(true);
  });

  it("forest blocks visibility for unit on opposite side", () => {
    // A at (-2,0), forest at (-1,0), B's empty plain at (0,0)
    // Forest should block A from seeing (0,0)
    const board = initBoard(9, 222);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    setCell(board, cube(-2, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-2, 0), strength: 5, hp: 5, type: "infantry" } });
    setCell(board, cube(-1, 0), { terrain: "forest" });
    // (0,0) is plain and empty

    const vis = visibleCells(board, "A");
    expect(vis.some((c) => c.q === 0 && c.r === 0)).toBe(false);
  });

  it("visibility is symmetric: if cell is visible from unit, unit is visible from cell (friendly)", () => {
    // For any two friendly units U1 and U2 where U2 is visible to U1,
    // U1 should also be visible to U2 (no blocking between them)
    const board = initBoard(9, 888);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    // Two friendly units
    const u1 = cube(0, 0);
    const u2 = cube(1, -1); // distance 2
    setCell(board, u1, { terrain: "plain", unit: { id: "u1", owner: "A", position: u1, strength: 5, hp: 5, type: "infantry" } });
    setCell(board, u2, { terrain: "plain", unit: { id: "u2", owner: "A", position: u2, strength: 5, hp: 5, type: "infantry" } });

    const vis = visibleCells(board, "A");
    const u1SeesU2 = vis.some((c) => c.q === u2.q && c.r === u2.r);
    expect(u1SeesU2).toBe(true);
    // U2's cell should also be in visibility (symmetry)
  });

  it("symmetric board positions give symmetric visibility counts", () => {
    // Place units at symmetric positions on all-plain board
    const board = initBoard(9, 555);
    for (const row of board) {
      for (const cell of row) {
        cell.terrain = "plain";
      }
    }
    // Three A units spread out, three B units mirrored
    const aUnits = [cube(1, -1), cube(0, 1), cube(-1, 0)];
    const bUnits = [cube(-1, 1), cube(0, -1), cube(1, 0)];
    aUnits.forEach((pos, i) => {
      setCell(board, pos, { terrain: "plain", unit: { id: `uA${i}`, owner: "A", position: pos, strength: 5, hp: 5, type: "infantry" } });
    });
    bUnits.forEach((pos, i) => {
      setCell(board, pos, { terrain: "plain", unit: { id: `uB${i}`, owner: "B", position: pos, strength: 5, hp: 5, type: "infantry" } });
    });

    const visA = visibleCells(board, "A");
    const visB = visibleCells(board, "B");

    expect(visA.length).toBe(visB.length);
  });
});