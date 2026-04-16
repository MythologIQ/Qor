import type { HexCell } from "../shared/types.ts";
import { neighbors } from "./coords.ts";

/**
 * Compute which player controls each cell on the board.
 * Rule: a cell becomes controlledBy=X if X has a unit on it
 * OR X has units on a majority of its neighbors (≥4 of 6).
 *
 * Returns a new board (does not mutate input).
 * Idempotent: if territory state matches current unit positions,
 * the returned board is structurally equal to the input.
 */
export function updateTerritory(board: HexCell[][]): HexCell[][] {
  // Deep-copy board so we can safely modify the copy
  const next: HexCell[][] = board.map((row) =>
    row.map((cell) => ({ ...cell }))
  );

  for (let r = 0; r < next.length; r++) {
    for (let q = 0; q < next[r].length; q++) {
      const cell = next[r][q];

      // Does player A have a unit directly on this cell?
      const aOnCell = cell.unit?.owner === "A";
      const bOnCell = cell.unit?.owner === "B";

      // Count neighbor cells with A/B units on them
      const nbrs = neighbors(cell.position);
      let aNeighbors = 0;
      let bNeighbors = 0;

      for (const nc of nbrs) {
        const nbrCell = findCell(next, nc);
        if (!nbrCell) continue;
        if (nbrCell.unit?.owner === "A") aNeighbors++;
        if (nbrCell.unit?.owner === "B") bNeighbors++;
      }

      // Majority threshold: >3 of 6 neighbors (i.e. ≥4)
      const aMajority = aNeighbors >= 4;
      const bMajority = bNeighbors >= 4;

      // Territory assignment
      if (aOnCell || (aMajority && !bOnCell && !bMajority)) {
        cell.controlledBy = "A";
      } else if (bOnCell || (bMajority && !aOnCell && !aMajority)) {
        cell.controlledBy = "B";
      } else {
        // No direct ownership and no majority — clear control
        cell.controlledBy = undefined;
      }
    }
  }

  return next;
}

/**
 * Find a cell by its cube coordinate within a board.
 * Returns undefined if the coord is not on the board.
 */
function findCell(
  board: HexCell[][],
  coord: { q: number; r: number; s: number },
): HexCell | undefined {
  for (const row of board) {
    for (const cell of row) {
      if (cell.position.q === coord.q && cell.position.r === coord.r && cell.position.s === coord.s) {
        return cell;
      }
    }
  }
  return undefined;
}
