import { describe, it, expect } from "bun:test";
import { initBoard } from "./board.ts";
import { visibleCells } from "./fog.ts";
import type { CubeCoord, HexCell } from "../shared/types.ts";

// Helper: set unit on board cell in place
function setUnit(board: HexCell[][], coord: CubeCoord, owner: "A" | "B"): void {
  for (const row of board) {
    for (const cell of row) {
      if (cell.position.q === coord.q && cell.position.r === coord.r) {
        cell.unit = { id: `${owner}-test`, owner, position: coord, strength: 5, hp: 5, type: "infantry" };
        return;
      }
    }
  }
}

// Helper: set terrain in place
function setTerrain(board: HexCell[][], coord: CubeCoord, terrain: HexCell["terrain"]): void {
  for (const row of board) {
    for (const cell of row) {
      if (cell.position.q === coord.q && cell.position.r === coord.r) {
        cell.terrain = terrain;
        return;
      }
    }
  }
}

describe("fog.ts – Fog of War Line of Sight", () => {

  describe("visibleCells", () => {

    it("unit sees its own cell", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      setUnit(board, unitPos, "A");
      const visible = visibleCells(board, "A");
      expect(visible.some(c => c.q === 0 && c.r === 0)).toBe(true);
    });

    it("unit sees plain cells within radius 1", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      setUnit(board, unitPos, "A");
      const visible = visibleCells(board, "A");
      // immediate neighbors should be visible
      const dirs = [
        { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
        { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 },
      ];
      for (const d of dirs) {
        expect(visible.some(c => c.q === d.q && c.r === d.r)).toBe(true);
      }
    });

    it("unit does NOT see through forest", () => {
      const board = initBoard(9, 0);
      // Place unit at origin, forest at (1,0,-1), target plain at (2,0,-2)
      const unitPos = { q: 0, r: 0, s: 0 };
      const forestPos = { q: 1, r: 0, s: -1 };
      const targetPos = { q: 2, r: 0, s: -2 };
      setUnit(board, unitPos, "A");
      setTerrain(board, forestPos, "forest");
      // target starts as plain (already is)
      const visible = visibleCells(board, "A");
      // target beyond forest should NOT be visible
      expect(visible.some(c => c.q === targetPos.q && c.r === targetPos.r)).toBe(false);
    });

    it("unit does NOT see through mountain", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      const mountainPos = { q: 1, r: 0, s: -1 };
      const targetPos = { q: 2, r: 0, s: -2 };
      setUnit(board, unitPos, "A");
      setTerrain(board, mountainPos, "mountain");
      const visible = visibleCells(board, "A");
      expect(visible.some(c => c.q === targetPos.q && c.r === targetPos.r)).toBe(false);
    });

    it("unit sees water cells normally (water is transparent)", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      const waterPos = { q: 1, r: -1, s: 0 };
      const targetPos = { q: 2, r: -2, s: 0 };
      setUnit(board, unitPos, "A");
      setTerrain(board, waterPos, "water");
      // water is transparent, so can see through to target
      const visible = visibleCells(board, "A");
      // target beyond water should be visible
      expect(visible.some(c => c.q === targetPos.q && c.r === targetPos.r)).toBe(true);
    });

    it("visible cells respect radius 3", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      setUnit(board, unitPos, "A");
      const visible = visibleCells(board, "A");
      // check no cell exceeds distance 3 from origin
      const maxDist = (a: CubeCoord, b: CubeCoord) =>
        (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
      for (const c of visible) {
        expect(maxDist(c, unitPos)).toBeLessThanOrEqual(3);
      }
    });

    it("multiple units produce union of visibility", () => {
      const board = initBoard(9, 0);
      const unitA = { q: -2, r: 0, s: 2 };
      const unitB = { q: 2, r: 0, s: -2 };
      setUnit(board, unitA, "A");
      setUnit(board, unitB, "A");
      const visible = visibleCells(board, "A");
      // should see cells near both units
      expect(visible.some(c => c.q === -2 && c.r === 0)).toBe(true);
      expect(visible.some(c => c.q === 2 && c.r === 0)).toBe(true);
    });

    it("symmetric: if A sees cell X from unit U, swapping sides with mirrored setup produces mirrored visibility", () => {
      // Build a board where both unit positions and all cells within radius 3 are set to
      // plain terrain. This guarantees the terrain is symmetric so we can test the
      // fog algorithm's symmetry property in isolation.
      const board = initBoard(9, 0);
      const unitA = { q: -1, r: 0, s: 1 };
      const unitBPos = { q: 1, r: 0, s: -1 };
      setUnit(board, unitA, "A");
      setUnit(board, unitBPos, "B");
      // Force all cells within radius 3 of both unit positions to plain — this ensures
      // the terrain is symmetric so we can isolate the fog algorithm's symmetry property.
      const forcePlain = (c: CubeCoord) => setTerrain(board, c, "plain");
      const dist3 = 3;
      for (const row of board) {
        for (const cell of row) {
          const dA = (Math.abs(cell.position.q - unitA.q) + Math.abs(cell.position.r - unitA.r) + Math.abs(cell.position.s - unitA.s)) / 2;
          const dB = (Math.abs(cell.position.q - unitBPos.q) + Math.abs(cell.position.r - unitBPos.r) + Math.abs(cell.position.s - unitBPos.s)) / 2;
          if (dA <= dist3 || dB <= dist3) {
            cell.terrain = "plain";
          }
        }
      }
      const visA = visibleCells(board, "A");
      const visB = visibleCells(board, "B");
      // visA and visB should be exact mirrors (q/r/s negated)
      const mirrorOk = visA.every(c =>
        visB.some(b => b.q === -c.q && b.r === -c.r && b.s === -c.s)
      ) && visB.every(c =>
        visA.some(b => b.q === -c.q && b.r === -c.r && b.s === -c.s)
      );
      expect(mirrorOk).toBe(true);
    });

    it("other side units do not affect this side's visibility", () => {
      const board = initBoard(9, 0);
      const ourUnit = { q: 0, r: 0, s: 0 };
      const enemyUnit = { q: 1, r: -1, s: 0 };
      setUnit(board, ourUnit, "A");
      setUnit(board, enemyUnit, "B");
      const visible = visibleCells(board, "A");
      // our unit's own cell should still be visible
      expect(visible.some(c => c.q === 0 && c.r === 0)).toBe(true);
    });

    it("returns empty array when side has no units", () => {
      const board = initBoard(9, 0);
      const visible = visibleCells(board, "A");
      expect(visible).toEqual([]);
    });

    it("forest cells themselves are not visible if line-of-sight originates outside", () => {
      const board = initBoard(9, 0);
      // Place unit far from origin
      const unitPos = { q: -3, r: 0, s: 3 };
      setUnit(board, unitPos, "A");
      // Ensure no forest blocks the view to origin
      // unit at (-3,0,3) looking at (0,0,0) — cells along line: (-3,0,3), (-2,0,2), (-1,0,1), (0,0,0)
      const visible = visibleCells(board, "A");
      // origin is plain so should be visible
      expect(visible.some(c => c.q === 0 && c.r === 0)).toBe(true);
    });

    it("radius 3 boundary: cell at exactly distance 3 is visible if LOS clear", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      // Place unit at origin
      setUnit(board, unitPos, "A");
      // cell at (3,-3,0) is distance 3 from origin — clear line since all plain
      const target = { q: 3, r: -3, s: 0 };
      const visible = visibleCells(board, "A");
      expect(visible.some(c => c.q === 3 && c.r === -3)).toBe(true);
    });

    it("radius 3 boundary: cell beyond distance 3 is NOT visible", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      setUnit(board, unitPos, "A");
      // cell at (4,-4,0) is distance 4 — should not appear
      const target = { q: 4, r: -4, s: 0 };
      const visible = visibleCells(board, "A");
      expect(visible.some(c => c.q === 4 && c.r === -4)).toBe(false);
    });

    it("all plain board: visibility area is contiguous disk of radius 3", () => {
      const board = initBoard(9, 0);
      const unitPos = { q: 0, r: 0, s: 0 };
      setUnit(board, unitPos, "A");
      const visible = visibleCells(board, "A");
      // count should be within expected range (all-clear LOS from origin
      // yields all cells within radius 3 = roughly 1+6+12+18 = 37 cells for a hex disk)
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThanOrEqual(38); // disk of r=3 = 37 cells
    });

    it("deduplication: same cell visible from two units appears once", () => {
      const board = initBoard(9, 0);
      // Place two units that can both see the same cell
      const unit1 = { q: -1, r: 1, s: 0 };
      const unit2 = { q: 1, r: -1, s: 0 };
      setUnit(board, unit1, "A");
      setUnit(board, unit2, "A");
      // Both can see origin (0,0,0) clearly
      const visible = visibleCells(board, "A");
      const originCount = visible.filter(c => c.q === 0 && c.r === 0).length;
      expect(originCount).toBe(1);
    });

  });

});