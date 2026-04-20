import { describe, it, expect } from "bun:test";
import { initBoard, cellAt, setCell } from "../../src/engine/board.ts";

describe("board", () => {
  describe("initBoard", () => {
    it("produces identical boards across calls with same seed", () => {
      const boardA = initBoard(9, 42);
      const boardB = initBoard(9, 42);
      expect(boardA).toEqual(boardB);
    });

    it("produces different boards for different seeds", () => {
      const boardA = initBoard(9, 42);
      const boardB = initBoard(9, 99);
      expect(boardA).not.toEqual(boardB);
    });

    it("board has correct dimensions (size x size)", () => {
      const board = initBoard(9, 0);
      expect(board.length).toBe(9);
      for (const row of board) {
        expect(row.length).toBe(9);
      }
    });

    it("board of size 5 has 5 rows of 5 cells", () => {
      const board = initBoard(5, 0);
      expect(board.length).toBe(5);
      for (const row of board) {
        expect(row.length).toBe(5);
      }
    });

    it("each cell has a valid terrain type", () => {
      const board = initBoard(9, 0);
      const validTerrains = new Set(["plain", "forest", "mountain", "water"]);
      for (const row of board) {
        for (const cell of row) {
          expect(validTerrains.has(cell.terrain)).toBe(true);
        }
      }
    });

    it("seed produces deterministic terrain distribution", () => {
      const boardA = initBoard(9, 12345);
      const boardB = initBoard(9, 12345);
      expect(boardA).toEqual(boardB);
    });
  });

  describe("cellAt", () => {
    it("returns correct cell for center coord", () => {
      const board = initBoard(9, 0);
      const center = { q: 0, r: 0, s: 0 };
      const cell = cellAt(board, center);
      expect(cell).toBeDefined();
      expect(cell!.position.q).toBe(center.q);
      expect(cell!.position.r).toBe(center.r);
    });

    it("returns undefined for out-of-bounds coord", () => {
      const board = initBoard(9, 0);
      const far = { q: 100, r: -100, s: 0 };
      expect(cellAt(board, far)).toBeUndefined();
    });

    it("returns correct cell at corner position", () => {
      const board = initBoard(9, 0);
      const corner = { q: -4, r: -4, s: 8 };
      const cell = cellAt(board, corner);
      expect(cell).toBeDefined();
      expect(cell!.position.q).toBe(corner.q);
      expect(cell!.position.r).toBe(corner.r);
    });

    it("cellAt is referentially stable across calls", () => {
      const board = initBoard(9, 0);
      const center = { q: 0, r: 0, s: 0 };
      const cell1 = cellAt(board, center);
      const cell2 = cellAt(board, center);
      expect(cell1).toBe(cell2);
    });
  });

  describe("setCell", () => {
    it("setCell updates the cell in place and returns it", () => {
      const board = initBoard(9, 0);
      const coord = { q: 0, r: 0, s: 0 };
      const originalTerrain = cellAt(board, coord)!.terrain;
      const newTerrain = originalTerrain === "plain" ? "forest" : "plain";

      const result = setCell(board, coord, { terrain: newTerrain });

      expect(result.terrain).toBe(newTerrain);
      expect(cellAt(board, coord)!.terrain).toBe(newTerrain);
    });

    it("setCell on one cell does not affect other cells", () => {
      const board = initBoard(9, 0);
      const coordA = { q: 0, r: 0, s: 0 };
      const coordB = { q: 1, r: -1, s: 0 };
      const originalB = cellAt(board, coordB)!.terrain;

      setCell(board, coordA, { terrain: "forest" });

      expect(cellAt(board, coordB)!.terrain).toBe(originalB);
    });

    it("setCell throws for invalid coord", () => {
      const board = initBoard(9, 0);
      const bad = { q: 999, r: -999, s: 0 };
      expect(() => setCell(board, bad, { terrain: "water" })).toThrow();
    });

    it("setCell applies partial update (preserves other fields)", () => {
      const board = initBoard(9, 0);
      const coord = { q: 0, r: 0, s: 0 };
      const originalPos = cellAt(board, coord)!.position;

      setCell(board, coord, { terrain: "mountain" });

      const updated = cellAt(board, coord)!;
      expect(updated.position.q).toBe(originalPos.q);
      expect(updated.position.r).toBe(originalPos.r);
    });
  });
});
