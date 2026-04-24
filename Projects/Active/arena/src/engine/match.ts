import { createHash } from "node:crypto";
import type { MatchState, HexCell, Unit } from "../shared/types.ts";
import { initBoard } from "./board.ts";
import { placeStartingUnits, getAllUnits } from "./units.ts";
import { ROUND_CAP } from "./constants.ts";

export interface MatchEvent {
  type: "turn_advanced" | "victory";
  turn: number;
  data: unknown;
}

const BOARD_SIZE = 9;
const DEADLINE_TURN_MS = 120_000;

function seedNumeric(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function flattenBoard(board: HexCell[][]): HexCell[] {
  const cells: HexCell[] = [];
  for (const row of board) {
    for (const cell of row) cells.push(cell);
  }
  return cells;
}

/**
 * Construct a new match in contract shape.
 * - `visible: HexCell[]` flat
 * - units placed via `placeStartingUnits` (mirror symmetry, scout/infantry/heavy)
 * - `score: { a, b }` lowercase
 * - `roundCap: ROUND_CAP`
 */
export function createMatch(
  seed: string,
  _sideA: string = "A",
  _sideB: string = "B",
): MatchState {
  const numericSeed = seedNumeric(seed);
  const board2d = initBoard(BOARD_SIZE, numericSeed);
  placeStartingUnits(board2d, numericSeed);
  const visible = flattenBoard(board2d);
  const units = getAllUnits(board2d);

  return {
    turn: 0,
    visible,
    units,
    score: { a: 0, b: 0 },
    deadline: DEADLINE_TURN_MS,
    roundCap: ROUND_CAP,
  };
}

export function computeMatchHash(state: MatchState): string {
  const canonical: MatchState = {
    ...state,
    units: [...state.units].sort((a, b) => {
      if (a.position.q !== b.position.q) return a.position.q - b.position.q;
      if (a.position.r !== b.position.r) return a.position.r - b.position.r;
      return a.position.s - b.position.s;
    }),
    visible: [...state.visible].sort((a, b) => {
      if (a.position.q !== b.position.q) return a.position.q - b.position.q;
      if (a.position.r !== b.position.r) return a.position.r - b.position.r;
      return a.position.s - b.position.s;
    }),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
