import { describe, it, expect } from "bun:test";
import { updateTerritory } from "./territory.ts";
import { initBoard } from "./board.ts";
import type { HexCell, Unit } from "../shared/types.ts";
import { cube } from "./coords.ts";

function makeUnit(id: string, owner: "A" | "B", q: number, r: number): Unit {
  return { id, owner, position: cube(q, r), strength: 5, hp: 5, type: "infantry" };
}

function placeUnit(board: HexCell[][], q: number, r: number, unit: Unit): HexCell[][] {
  return board.map((row) =>
    row.map((cell) => {
      if (cell.position.q === q && cell.position.r === r) {
        return { ...cell, unit };
      }
      return cell;
    })
  );
}

describe("updateTerritory", () => {
  it("clears territory when no units are on the board", () => {
    const board = initBoard(9, 42);
    const result = updateTerritory(board);
    for (const row of result) {
      for (const cell of row) {
        expect(cell.controlledBy).toBeUndefined();
      }
    }
  });

  it("sets controlledBy=A when A has a unit on the cell", () => {
    const board = initBoard(9, 1);
    const boardWithUnit = placeUnit(board, 0, 0, makeUnit("u1", "A", 0, 0));
    const result = updateTerritory(boardWithUnit);
    const cell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);
    expect(cell?.controlledBy).toBe("A");
  });

  it("sets controlledBy=B when B has a unit on the cell", () => {
    const board = initBoard(9, 2);
    const boardWithUnit = placeUnit(board, 0, 0, makeUnit("u1", "B", 0, 0));
    const result = updateTerritory(boardWithUnit);
    const cell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);
    expect(cell?.controlledBy).toBe("B");
  });

  it("cell with unit is controlled by its owner even if neighbor majority belongs to opponent", () => {
    // A unit at origin, B has 4 neighbors of origin — but the origin cell is owned by A
    const board = initBoard(9, 3);
    let b = placeUnit(board, 0, 0, makeUnit("u1", "A", 0, 0));
    // Place B units on 4 neighbors
    b = placeUnit(b, 1, -1, makeUnit("b1", "B", 1, -1));
    b = placeUnit(b, 1, 0, makeUnit("b2", "B", 1, 0));
    b = placeUnit(b, 0, 1, makeUnit("b3", "B", 0, 1));
    b = placeUnit(b, -1, 1, makeUnit("b4", "B", -1, 1));

    const result = updateTerritory(b);
    const originCell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);

    // Direct unit ownership wins over neighbor majority
    expect(originCell?.controlledBy).toBe("A");
  });

  it("cell with no unit is controlled by A when A has ≥4 of 6 neighbors", () => {
    const board = initBoard(9, 4);
    let b = board;
    // A has 4 neighbors around origin cell (0,0) which has no unit
    b = placeUnit(b, 1, -1, makeUnit("a1", "A", 1, -1));
    b = placeUnit(b, 1, 0, makeUnit("a2", "A", 1, 0));
    b = placeUnit(b, 0, 1, makeUnit("a3", "A", 0, 1));
    b = placeUnit(b, -1, 1, makeUnit("a4", "A", -1, 1));
    // B has 2 neighbors
    b = placeUnit(b, -1, 0, makeUnit("b1", "B", -1, 0));
    b = placeUnit(b, 0, -1, makeUnit("b2", "B", 0, -1));

    const result = updateTerritory(b);
    // Find origin cell (0,0)
    const originCell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);

    expect(originCell?.controlledBy).toBe("A");
  });

  it("cell with no unit is controlled by B when B has ≥4 of 6 neighbors", () => {
    const board = initBoard(9, 5);
    let b = board;
    b = placeUnit(b, 1, -1, makeUnit("b1", "B", 1, -1));
    b = placeUnit(b, 1, 0, makeUnit("b2", "B", 1, 0));
    b = placeUnit(b, 0, 1, makeUnit("b3", "B", 0, 1));
    b = placeUnit(b, -1, 1, makeUnit("b4", "B", -1, 1));
    b = placeUnit(b, -1, 0, makeUnit("a1", "A", -1, 0));
    b = placeUnit(b, 0, -1, makeUnit("a2", "A", 0, -1));

    const result = updateTerritory(b);
    const originCell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);

    expect(originCell?.controlledBy).toBe("B");
  });

  it("cell with no unit and equal 3-3 neighbor split has no controller", () => {
    const board = initBoard(9, 6);
    let b = board;
    b = placeUnit(b, 1, -1, makeUnit("a1", "A", 1, -1));
    b = placeUnit(b, 1, 0, makeUnit("a2", "A", 1, 0));
    b = placeUnit(b, 0, 1, makeUnit("a3", "A", 0, 1));
    b = placeUnit(b, -1, 1, makeUnit("b1", "B", -1, 1));
    b = placeUnit(b, -1, 0, makeUnit("b2", "B", -1, 0));
    b = placeUnit(b, 0, -1, makeUnit("b3", "B", 0, -1));

    const result = updateTerritory(b);
    const originCell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);

    expect(originCell?.controlledBy).toBeUndefined();
  });

  it("cell with no unit and 2-2 neighbor split (2 off-board) has no controller", () => {
    // Origin cell neighbors might include off-board coords; they are simply skipped
    const board = initBoard(9, 7);
    let b = board;
    // Only 2 valid neighbors on board — not a majority
    b = placeUnit(b, 1, -1, makeUnit("a1", "A", 1, -1));
    b = placeUnit(b, 0, 1, makeUnit("a2", "A", 0, 1));
    b = placeUnit(b, -1, 0, makeUnit("b1", "B", -1, 0));

    const result = updateTerritory(b);
    const originCell = result.find((row) =>
      row.some((c) => c.position.q === 0 && c.position.r === 0)
    )?.find((c) => c.position.q === 0 && c.position.r === 0);

    expect(originCell?.controlledBy).toBeUndefined();
  });

  it("is idempotent when no units move", () => {
    const board = initBoard(9, 8);
    let b = placeUnit(board, 0, 0, makeUnit("a1", "A", 0, 0));
    b = placeUnit(b, 1, -1, makeUnit("b1", "B", 1, -1));

    const first = updateTerritory(b);
    const second = updateTerritory(first);
    const third = updateTerritory(second);

    for (let r = 0; r < first.length; r++) {
      for (let q = 0; q < first[r].length; q++) {
        expect(first[r][q].controlledBy).toBe(second[r][q].controlledBy);
        expect(second[r][q].controlledBy).toBe(third[r][q].controlledBy);
      }
    }
  });

  it("does not mutate the original board", () => {
    const board = initBoard(9, 9);
    let b = placeUnit(board, 0, 0, makeUnit("a1", "A", 0, 0));
    const snapshot = b.map((row) => row.map((c) => ({ ...c, unit: c.unit ? { ...c.unit } : undefined })));

    updateTerritory(b);

    // Original board units are unchanged
    for (let r = 0; r < b.length; r++) {
      for (let q = 0; q < b[r].length; q++) {
        expect(b[r][q].controlledBy).toBe(snapshot[r][q].controlledBy);
      }
    }
  });

  it("returns a new board object (not same reference)", () => {
    const board = initBoard(9, 10);
    const result = updateTerritory(board);
    expect(result).not.toBe(board);
    expect(result[0]).not.toBe(board[0]);
  });

  it("cells without units and no majority neighbor are cleared of territory", () => {
    const board = initBoard(9, 11);
    let b = placeUnit(board, 0, 0, makeUnit("a1", "A", 0, 0));
    const result = updateTerritory(b);

    // Find a cell far from origin with no units and no majority neighbor
    // It should have controlledBy cleared
    const farCell = result[8]?.[8];
    if (farCell && !farCell.unit) {
      expect(farCell.controlledBy).toBeUndefined();
    }
  });
});
