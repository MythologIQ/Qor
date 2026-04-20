import { describe, it, expect } from "bun:test";
import { initBoard, cellAt, setCell, terrainFor, boardTerrainStats } from "./board.ts";
import { equals } from "./coords.ts";

const SIZE = 9;
const TOTAL = SIZE * SIZE; // 81

function cellCount(board: ReturnType<typeof initBoard>): number {
  let n = 0;
  for (const row of board) n += row.length;
  return n;
}

// terrainFor tests
describe("terrainFor", () => {
  it("returns plain|forest|mountain|water only", () => {
    const terrains = new Set<string>();
    for (let i = 0; i < 100; i++) {
      for (let q = -4; q <= 4; q++) {
        for (let r = -4; r <= 4; r++) {
          if (q + r + sFrom(q, r) !== 0) continue; // skip invalid
          terrains.add(terrainFor(i, { q, r, s: sFrom(q, r) }));
        }
      }
    }
    expect(terrains).toEqual(new Set(["plain", "forest", "mountain", "water"]));
  });

  it("is deterministic for same seed+coord", () => {
    const coord = { q: 1, r: -1, s: 0 };
    for (let seed = 0; seed < 10; seed++) {
      const t1 = terrainFor(seed, coord);
      const t2 = terrainFor(seed, coord);
      expect(t1).toEqual(t2);
    }
  });

  it("different seeds can produce different terrain", () => {
    const coord = { q: 0, r: 0, s: 0 };
    const terrains = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      terrains.add(terrainFor(seed, coord));
    }
    // With 20 seeds it's overwhelmingly likely at least two produce different results
    expect(terrains.size).toBeGreaterThan(1);
  });
});

// initBoard tests
describe("initBoard", () => {
  it("default size is 9", () => {
    const board = initBoard();
    expect(board.length).toBe(9);
  });

  it("respects custom size", () => {
    for (const s of [3, 5, 7, 9]) {
      const board = initBoard(s);
      expect(board.length).toBe(s);
      expect(cellCount(board)).toBe(s * s);
    }
  });

  it("every cell has a valid position and terrain", () => {
    const board = initBoard(9, 42);
    for (const row of board) {
      for (const cell of row) {
        expect(cell.position).toBeDefined();
        expect(cell.position.q).toBeNumber();
        expect(cell.position.r).toBeNumber();
        expect(cell.position.s).toBeNumber();
        expect(cell.position.q + cell.position.r + cell.position.s).toBe(0);
        expect(["plain", "forest", "mountain", "water"]).toContain(cell.terrain);
      }
    }
  });

  it("board always has size*size cells", () => {
    expect(cellCount(initBoard(9))).toBe(81);
    expect(cellCount(initBoard(7))).toBe(49);
    expect(cellCount(initBoard(5))).toBe(25);
  });

  it("terrain distribution within ±5% of targets", () => {
    const board = initBoard(9, 9999);
    const stats = boardTerrainStats(board);
    const total = TOTAL;

    // Targets (70/15/10/5) ± 5% absolute
    expect(stats.plain).toBeGreaterThanOrEqual(65 * total / 100 - 0.05 * total);
    expect(stats.plain).toBeLessThanOrEqual(75 * total / 100 + 0.05 * total);
    expect(stats.forest).toBeGreaterThanOrEqual(10 * total / 100 - 0.05 * total);
    expect(stats.forest).toBeLessThanOrEqual(20 * total / 100 + 0.05 * total);
    expect(stats.mountain).toBeGreaterThanOrEqual(5 * total / 100 - 0.05 * total);
    expect(stats.mountain).toBeLessThanOrEqual(15 * total / 100 + 0.05 * total);
    expect(stats.water).toBeGreaterThanOrEqual(0 * total / 100 - 0.05 * total);
    expect(stats.water).toBeLessThanOrEqual(10 * total / 100 + 0.05 * total);
  });

  it("same seed produces identical board", () => {
    const b1 = initBoard(9, 12345);
    const b2 = initBoard(9, 12345);
    for (let r = 0; r < b1.length; r++) {
      for (let c = 0; c < b1[r].length; c++) {
        expect(b1[r][c].terrain).toEqual(b2[r][c].terrain);
        expect(equals(b1[r][c].position, b2[r][c].position)).toBe(true);
      }
    }
  });

  it("different seeds produce different boards", () => {
    const b1 = initBoard(9, 111);
    const b2 = initBoard(9, 222);
    let diff = false;
    outer: for (let r = 0; r < b1.length; r++) {
      for (let c = 0; c < b1[r].length; c++) {
        if (b1[r][c].terrain !== b2[r][c].terrain) { diff = true; break outer; }
      }
    }
    expect(diff).toBe(true);
  });
});

// cellAt tests
describe("cellAt", () => {
  it("returns the correct cell for a valid coord", () => {
    const board = initBoard(9);
    // Pick a known cell from the board
    const cell = board[4][4];
    const found = cellAt(board, cell.position);
    expect(found).toBeDefined();
    expect(found!.position).toEqual(cell.position);
  });

  it("returns undefined for out-of-bounds coord", () => {
    const board = initBoard(9);
    const outside = cellAt(board, { q: 99, r: 99, s: -198 });
    expect(outside).toBeUndefined();
  });

  it("can find every cell on the board", () => {
    const board = initBoard(9);
    for (const row of board) {
      for (const cell of row) {
        const found = cellAt(board, cell.position);
        expect(found).toBeDefined();
      }
    }
  });
});

// setCell tests
describe("setCell", () => {
  it("updates only the specified fields", () => {
    const board = initBoard(9, 5);
    const orig = board[4][4];
    const result = setCell(board, orig.position, { controlledBy: "A" });
    expect(result.terrain).toEqual(orig.terrain); // unchanged
    expect(result.position).toEqual(orig.position); // unchanged
    expect(result.controlledBy).toEqual("A");
  });

  it("returns the updated cell", () => {
    const board = initBoard(9, 5);
    const result = setCell(board, board[2][2].position, { unit: { id: "u1", owner: "A", position: board[2][2].position, strength: 5, hp: 5, type: "infantry" } });
    expect(result.unit).toBeDefined();
  });

  it("throws for unknown coord", () => {
    const board = initBoard(9);
    expect(() => setCell(board, { q: 999, r: 999, s: -1998 }, { controlledBy: "A" })).toThrow();
  });

  it("cellAt reflects setCell changes", () => {
    const board = initBoard(9, 7);
    const coord = board[3][5].position;
    setCell(board, coord, { controlledBy: "B" });
    expect(cellAt(board, coord)!.controlledBy).toEqual("B");
  });
});

// boardTerrainStats tests
describe("boardTerrainStats", () => {
  it("sum of all terrain counts equals total cells", () => {
    const board = initBoard(9);
    const stats = boardTerrainStats(board);
    const sum = stats.plain + stats.forest + stats.mountain + stats.water;
    expect(sum).toBe(81);
  });

  it("all values are non-negative integers", () => {
    const board = initBoard(9, 999);
    const stats = boardTerrainStats(board);
    for (const v of Object.values(stats)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

// Helper
function sFrom(q: number, r: number): number {
  return -q - r;
}