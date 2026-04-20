import { describe, it, expect } from "bun:test";
import { initBoard, setCell } from "../../src/engine/board.ts";
import { cube } from "../../src/engine/coords.ts";
import { visibleCells } from "../../src/engine/fog.ts";

describe("fog", () => {
  describe("visibleCells — radius", () => {
    it("unit sees its own cell", () => {
      const board = initBoard(9, 0);
      // Place a unit at origin for side A
      setCell(board, cube(0, 0), { unit: { id: "u1", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 0 && c.r === 0)).toBe(true);
    });

    it("unit sees cells within radius 3", () => {
      const board = initBoard(9, 0);
      setCell(board, cube(0, 0), { unit: { id: "u1", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      const vis = visibleCells(board, "A");
      // All visible cells must be within distance <= 3
      for (const cell of vis) {
        const d = (Math.abs(cell.q) + Math.abs(cell.r) + Math.abs(cell.s)) / 2;
        expect(d).toBeLessThanOrEqual(3);
      }
    });

    it("does not see cells beyond radius 3", () => {
      const board = initBoard(9, 0);
      setCell(board, cube(0, 0), { unit: { id: "u1", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      const vis = visibleCells(board, "A");
      // Cells at distance 4 should NOT be visible (radius is exactly 3)
      for (let q = -4; q <= 4; q++) {
        for (let r = -4; r <= 4; r++) {
          const s = -q - r;
          const d = (Math.abs(q) + Math.abs(r) + Math.abs(s)) / 2;
          if (d === 4) {
            expect(vis.some((c) => c.q === q && c.r === r)).toBe(false);
          }
        }
      }
    });

    it("multiple units accumulate visibility", () => {
      const board = initBoard(9, 0);
      setCell(board, cube(0, 0), { unit: { id: "u1", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(3, -3), { unit: { id: "u2", owner: "A", position: cube(3, -3), strength: 5, hp: 5, type: "scout" } });
      const vis = visibleCells(board, "A");
      // Both origin and (3,-3) cells should be visible
      expect(vis.some((c) => c.q === 0 && c.r === 0)).toBe(true);
      expect(vis.some((c) => c.q === 3 && c.r === -3)).toBe(true);
    });

    it("enemy units do not contribute visibility to side A", () => {
      // Enemy unit is at (2,-1), which is distance 1 from origin
      // (2,-1) is within radius 3 but it's B's unit — it should NOT be visible to A
      // because A only gets visibility from A's own units, not B's
      const board = initBoard(9, 0);
      setCell(board, cube(0, 0), { unit: { id: "uA", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(2, -1), { unit: { id: "uB", owner: "B", position: cube(2, -1), strength: 5, hp: 5, type: "infantry" } });
      const visA = visibleCells(board, "A");
      // A should NOT see B's unit cell even though it's within radius and on plain terrain
      expect(visA.some((c) => c.q === 2 && c.r === -1)).toBe(false);
    });
  });

  describe("visibleCells — terrain blocking", () => {
    it("mountain blocks line-of-sight (cannot see through mountain)", () => {
      // Unit at (-1, 0), mountain at (1, 0), target at (2, 0)
      // Ray: (-1,0) -> (0,0) -> (1,0)[mountain blocks] -> (2,0)
      // Target (2,0) is at distance 3 from unit (within radius), but mountain blocks
      const board = initBoard(9, 0);
      setCell(board, cube(-1, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-1, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(1, 0), { terrain: "mountain" });
      setCell(board, cube(2, 0), { terrain: "plain" });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 2 && c.r === 0)).toBe(false);
    });

    it("mountain blocks line-of-sight into mountain cell itself", () => {
      // Unit at (-1, 0), mountain at (1, 0) — distance 2 from unit
      const board = initBoard(9, 0);
      setCell(board, cube(-1, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-1, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(1, 0), { terrain: "mountain" });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 1 && c.r === 0)).toBe(false);
    });

    it("forest blocks line-of-sight", () => {
      // Unit at (-1, 0), forest at (0, 0), target at (1, 0)
      // Ray blocked by forest at (0,0)
      const board = initBoard(9, 0);
      setCell(board, cube(-1, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-1, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(0, 0), { terrain: "forest" });
      setCell(board, cube(1, 0), { terrain: "plain" });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 1 && c.r === 0)).toBe(false);
    });

    it("plain does not block line-of-sight", () => {
      // Unit at (-1, 0), plain at (0, 0), target at (1, 0)
      // All plain — target at (1,0) is distance 2 from unit (within radius 3)
      const board = initBoard(9, 0);
      setCell(board, cube(-1, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-1, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(0, 0), { terrain: "plain" });
      setCell(board, cube(1, 0), { terrain: "plain" });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 1 && c.r === 0)).toBe(true);
    });

    it("water does not block line-of-sight", () => {
      // Unit at (-1, 0), water at (0, 0), target at (1, 0)
      // Water is transparent — target should be visible
      const board = initBoard(9, 0);
      setCell(board, cube(-1, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-1, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(0, 0), { terrain: "water" });
      setCell(board, cube(1, 0), { terrain: "plain" });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 1 && c.r === 0)).toBe(true);
    });

    it("blocking terrain at any point along ray blocks visibility", () => {
      // Unit at (-2, 0), mountain at (-1, 0), target at (1, 0)
      // Ray: (-2,0) -> (-1,0)[mountain blocks] -> (0,0) -> (1,0)
      // Target (1,0) is at distance 3 from unit (within radius 3), but mountain blocks
      const board = initBoard(9, 0);
      setCell(board, cube(-2, 0), { terrain: "plain", unit: { id: "uA", owner: "A", position: cube(-2, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board, cube(-1, 0), { terrain: "mountain" });
      setCell(board, cube(1, 0), { terrain: "plain" });
      const vis = visibleCells(board, "A");
      expect(vis.some((c) => c.q === 1 && c.r === 0)).toBe(false);
    });
  });

  describe("visibleCells — deterministic", () => {
    it("identical board + units produce identical visibility", () => {
      const board1 = initBoard(9, 42);
      const board2 = initBoard(9, 42);
      setCell(board1, cube(0, 0), { unit: { id: "u1", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      setCell(board2, cube(0, 0), { unit: { id: "u1", owner: "A", position: cube(0, 0), strength: 5, hp: 5, type: "infantry" } });
      const vis1 = visibleCells(board1, "A");
      const vis2 = visibleCells(board2, "A");
      expect(vis1).toEqual(vis2);
    });
  });
});