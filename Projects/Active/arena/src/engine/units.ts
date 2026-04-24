import type { CubeCoord, HexCell, Unit, UnitWeight } from "../shared/types.ts";
import { cellAt } from "./board.ts";

/**
 * Unit type definitions with their base stats.
 */
export type UnitType = "infantry" | "scout" | "heavy";

/** Default HP per unit type */
const DEFAULT_HP: Record<UnitType, number> = {
  infantry: 5,
  scout: 3,
  heavy: 8,
};

/** Default strength per unit type */
const DEFAULT_STRENGTH: Record<UnitType, number> = {
  infantry: 3,
  scout: 2,
  heavy: 5,
};

/** Default weight per unit type: drives bid economy and aim-penalty. */
export const DEFAULT_WEIGHT: Record<UnitType, UnitWeight> = {
  scout: 1,
  infantry: 2,
  heavy: 3,
};

/**
 * Global ID counter for deterministic unit IDs within a single run.
 * Resets each module load.
 */
let _idCounter = 0;
function nextId(): string {
  return `unit-${String(_idCounter++).padStart(3, "0")}`;
}

/**
 * Deterministic unit ID derived from owner and position.
 * Uses a hash so the same (owner, pos) always gets the same ID across runs.
 */
export function deterministicId(owner: "A" | "B", pos: CubeCoord): string {
  const h = (owner.charCodeAt(0) * 374761393) ^ (pos.q * 2246822519) ^ (pos.r * 668265263) ^ (pos.s * 1998583889);
  return `unit-${String(Math.abs(h) % 1000).padStart(3, "0")}`;
}

/**
 * Create a single unit at a given position.
 * Stats are deterministic per (owner, pos, type) so they are stable
 * across repeated calls with the same arguments.
 */
export function createUnit(
  owner: "A" | "B",
  pos: CubeCoord,
  type: UnitType,
): Unit {
  return {
    id: deterministicId(owner, pos),
    owner,
    position: { q: pos.q, r: pos.r, s: pos.s },
    strength: DEFAULT_STRENGTH[type],
    hp: DEFAULT_HP[type],
    type,
    weight: DEFAULT_WEIGHT[type],
  };
}

/**
 * Mirror a cube coordinate across the q-axis midline (q → -q, s → -s, r unchanged).
 * This preserves q+r+s=0.
 */
function mirrorQ(coord: CubeCoord): CubeCoord {
  return { q: -coord.q, r: coord.r, s: -coord.s };
}

/**
 * Fixed starting positions for side B (right side, q > 0, r = 0).
 * All three r=0 positions have valid q-mirrors on a size-9 board.
 */
const SEED_POSITIONS_B: CubeCoord[] = [
  { q: 1, r: 0, s: -1 },
  { q: 2, r: 0, s: -2 },
  { q: 3, r: 0, s: -3 },
];

/**
 * Deterministic unit type assignment from board seed.
 * Uses a per-position hash so the assignment is stable.
 */
function unitTypeFor(seed: number, coord: CubeCoord, index: number): UnitType {
  const TYPES: UnitType[] = ["infantry", "scout", "heavy"];
  const h = (seed * 2654435761) ^ (coord.q * 2246822519) ^ (coord.r * 668265263) ^ (index * 3266489917);
  return TYPES[Math.abs(h) % TYPES.length];
}

/**
 * Place exactly 3 units per side on the board, mirror-symmetric across
 * the q-axis midline (q=0).
 *
 * - Side B units occupy fixed positions on the right (positive q).
 * - Side A units occupy the exact q-mirrors on the left (negative q).
 * - Unit types are deterministically derived from the board seed so
 *   the same seed always produces the same army composition.
 *
 * Returns the same board reference (mutated in place) for chaining.
 *
 * @throws Error if any starting position is outside the board.
 */
export function placeStartingUnits(
  board: HexCell[][],
  seed: number = 0,
): HexCell[][] {
  for (let i = 0; i < SEED_POSITIONS_B.length; i++) {
    const posB = SEED_POSITIONS_B[i];
    const posA = mirrorQ(posB);
    const type = unitTypeFor(seed, posB, i);

    const cellB = cellAt(board, posB);
    if (!cellB) throw new Error(`placeStartingUnits: no cell at B start ${JSON.stringify(posB)}`);
    if (cellB.unit) throw new Error(`placeStartingUnits: cell already occupied at ${JSON.stringify(posB)}`);

    const cellA = cellAt(board, posA);
    if (!cellA) throw new Error(`placeStartingUnits: no cell at A start ${JSON.stringify(posA)}`);
    if (cellA.unit) throw new Error(`placeStartingUnits: cell already occupied at ${JSON.stringify(posA)}`);

    cellB.unit = createUnit("B", posB, type);
    cellA.unit = createUnit("A", posA, type);
  }

  return board;
}

/**
 * Get all units currently on the board.
 * Scans every cell; returns units in scan order (row-major).
 */
export function getAllUnits(board: HexCell[][]): Unit[] {
  const units: Unit[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell.unit) units.push(cell.unit);
    }
  }
  return units;
}

/**
 * Count units by owner.
 */
export function countUnits(board: HexCell[][]): { a: number; b: number } {
  const units = getAllUnits(board);
  return {
    a: units.filter((u) => u.owner === "A").length,
    b: units.filter((u) => u.owner === "B").length,
  };
}

/**
 * Remove a unit from a board cell by coordinate.
 * No-op if the cell is empty.
 */
export function removeUnit(board: HexCell[][], coord: CubeCoord): void {
  const cell = cellAt(board, coord);
  if (cell) cell.unit = undefined;
}

/**
 * Move a unit from one cell to another.
 * The destination must be empty.
 *
 * @throws Error if origin has no unit or destination is already occupied.
 */
export function moveUnit(
  board: HexCell[][],
  from: CubeCoord,
  to: CubeCoord,
): void {
  const src = cellAt(board, from);
  if (!src || !src.unit) throw new Error(`moveUnit: no unit at ${JSON.stringify(from)}`);
  const dst = cellAt(board, to);
  if (!dst) throw new Error(`moveUnit: no cell at ${JSON.stringify(to)}`);
  if (dst.unit) throw new Error(`moveUnit: destination occupied at ${JSON.stringify(to)}`);

  dst.unit = { ...src.unit, position: { q: to.q, r: to.r, s: to.s } };
  src.unit = undefined;
}
