import type { CubeCoord, HexCell } from "../shared/types.ts";
import { distance, equals, neighbors } from "./coords.ts";

/**
 * Cast a ray from origin toward target using cube-linear interpolation.
 * Yields every cube coord the ray passes through (endpoint inclusive).
 * Blocked cells are not excluded here — callers filter by blocking.
 */
function rayCells(origin: CubeCoord, target: CubeCoord): CubeCoord[] {
  const N = distance(origin, target);
  if (N === 0) return [origin];
  const cells: CubeCoord[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    cells.push({
      q: Math.round(origin.q + (target.q - origin.q) * t),
      r: Math.round(origin.r + (target.r - origin.r) * t),
      s: Math.round(origin.s + (target.s - origin.s) * t),
    });
  }
  return cells;
}

/** True if the cell is transparent to line-of-sight (can be seen through). */
function isTransparent(cell: HexCell | undefined): boolean {
  return cell !== undefined && cell.terrain !== "forest" && cell.terrain !== "mountain";
}

/** True if the cell blocks line-of-sight completely. */
function isBlocking(cell: HexCell | undefined): boolean {
  return cell === undefined || cell.terrain === "forest" || cell.terrain === "mountain";
}

/**
 * Compute line-of-sight from origin to target.
 * Returns true if the ray passes only through transparent cells.
 * Water and plain cells are transparent; forest and mountain block vision.
 */
function hasLineOfSight(
  board: HexCell[][],
  origin: CubeCoord,
  target: CubeCoord,
): boolean {
  const cells = rayCells(origin, target);
  // skip origin (don't test origin cell blocking)
  for (let i = 1; i < cells.length; i++) {
    if (isBlocking(cellAtBoard(board, cells[i]))) return false;
  }
  return true;
}

/**
 * Look up a cell by cube coordinate on the board.
 * Returns undefined for out-of-bounds coords.
 */
function cellAtBoard(board: HexCell[][], c: CubeCoord): HexCell | undefined {
  for (const row of board) {
    for (const cell of row) {
      if (equals(cell.position, c)) return cell;
    }
  }
  return undefined;
}

/**
 * Get all units belonging to `side` that are present on the board.
 */
function getUnitsForSide(board: HexCell[][], side: "A" | "B"): HexCell[] {
  const units: HexCell[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell.unit && cell.unit.owner === side) units.push(cell);
    }
  }
  return units;
}

/**
 * Fog of War — Line of Sight Visibility
 *
 * For each unit belonging to `side`, compute every cell within radius 3
 * that has an unobstructed line-of-sight from that unit.
 * Returns the union of all visible cells (deduplicated by coordinate).
 *
 * Terrain blocking rules:
 *   plain  — transparent, does not block LOS
 *   water  — transparent, does not block LOS
 *   forest — blocks LOS completely (cannot see through or into forest cells)
 *   mountain — blocks LOS completely (cannot see through or into mountain cells)
 *
 * Units do NOT block line-of-sight.
 *
 * @param board - The hex cell board
 * @param side  - "A" or "B"
 * @returns     - Array of visible CubeCoords
 */
export function visibleCells(board: HexCell[][], side: "A" | "B"): CubeCoord[] {
  const units = getUnitsForSide(board, side);
  const visibleSet = new Set<string>();

  for (const unitCell of units) {
    const origin = unitCell.position;

    // BFS/iterate all cells within radius 3
    const frontier: CubeCoord[] = [origin];
    const visited = new Set<string>([`${origin.q},${origin.r}`]);

    while (frontier.length > 0) {
      const current = frontier.shift()!;
      const d = distance(origin, current);

      // Already beyond sight radius — skip expansion but mark as potentially visible
      if (d <= 3) {
        // Check LOS from origin to current cell
        if (current !== origin) {
          const targetCell = cellAtBoard(board, current);
          if (isTransparent(targetCell) && hasLineOfSight(board, origin, current)) {
            visibleSet.add(`${current.q},${current.r},${current.s}`);
          }
        } else {
          // unit's own cell is always visible
          visibleSet.add(`${current.q},${current.r},${current.s}`);
        }

        // Expand to neighbors only if within radius and not beyond 3
        if (d < 3) {
          for (const nb of neighbors(current)) {
            const key = `${nb.q},${nb.r}`;
            if (!visited.has(key)) {
              visited.add(key);
              frontier.push(nb);
            }
          }
        }
      }
    }
  }

  return Array.from(visibleSet).map((key) => {
    const [q, r, s] = key.split(",").map(Number);
    return { q, r, s };
  });
}