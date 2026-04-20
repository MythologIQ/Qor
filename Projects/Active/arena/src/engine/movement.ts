import type { CubeCoord, HexCell, Unit } from "../shared/types.ts";
import { distance, equals } from "./coords.ts";
import { cellAt } from "./board.ts";

/**
 * Returns true if a unit can move to toCoord.
 * Rules:
 *   - distance == 1 (one hex step)
 *   - target cell is passable (not mountain, not water)
 *   - target cell is empty or occupied by enemy (attack not considered here)
 */
export function canMove(
  board: HexCell[][],
  unit: Unit,
  toCoord: CubeCoord,
): boolean {
  // Distance must be exactly 1
  if (distance(unit.position, toCoord) !== 1) {
    return false;
  }

  const dst = cellAt(board, toCoord);
  if (!dst) return false; // off-board

  // Terrain must be passable
  if (dst.terrain === "mountain" || dst.terrain === "water") {
    return false;
  }

  // Target must not be occupied by a friendly unit
  if (dst.unit && dst.unit.owner === unit.owner) {
    return false;
  }

  return true;
}

/**
 * Apply a move: return a NEW board with the unit relocated.
 * Does NOT mutate the input board.
 *
 * @throws Error if move is invalid (use canMove to validate first)
 */
export function applyMove(
  board: HexCell[][],
  unit: Unit,
  toCoord: CubeCoord,
): HexCell[][] {
  if (!canMove(board, unit, toCoord)) {
    throw new Error(
      `applyMove: move from ${JSON.stringify(unit.position)} to ${JSON.stringify(toCoord)} is invalid`,
    );
  }

  // Deep clone the board so we don't mutate the input
  const next: HexCell[][] = board.map((row) =>
    row.map((cell) => ({
      ...cell,
      position: { ...cell.position },
      unit: cell.unit
        ? { ...cell.unit, position: { ...cell.unit.position } }
        : undefined,
    }))
  );

  // Clear the source cell
  const src = cellAt(next, unit.position);
  if (!src) throw new Error("applyMove: source cell vanished");
  src.unit = undefined;

  // Place unit at destination
  const dst = cellAt(next, toCoord);
  if (!dst) throw new Error("applyMove: destination cell vanished");
  dst.unit = {
    ...unit,
    position: { q: toCoord.q, r: toCoord.r, s: toCoord.s },
  };

  return next;
}
