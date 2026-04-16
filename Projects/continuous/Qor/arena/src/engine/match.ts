import { createHash } from "node:crypto";
import type { MatchState, AgentAction, CubeCoord, HexCell, Unit } from "../shared/types.ts";
import { advanceTurn } from "./turns.ts";
import { checkVictory } from "./victory.ts";

export interface MatchResult {
  state: MatchState;
  events: MatchEvent[];
  ended: boolean;
}

export interface MatchEvent {
  type: "turn_advanced" | "victory";
  turn: number;
  data: unknown;
}

const BOARD_SIZE = 7;

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function makeUnits(side: "A" | "B", rand: () => number): Unit[] {
  const units: Unit[] = [];
  const cols = [0, 1, 2, 3, 4, 5, 6];
  const aCols = cols.slice(0, 3);
  const bCols = cols.slice(4, 7);
  const positions = side === "A" ? aCols : bCols;
  for (const r of [0, 1, 2, 3, 4, 5, 6]) {
    for (const q of positions) {
      const s = -q - r;
      if (Math.abs(s) > 3) continue;
      const role = r === 0 || r === 6 ? "infantry" : "cavalry";
      units.push({ id: `${side}-${q}-${r}-${s}`, owner: side, role, position: { q, r, s }, strength: 100 });
    }
  }
  return units;
}

function makeBoard(rand: () => number): HexCell[] {
  const cells: HexCell[] = [];
  for (let q = -BOARD_SIZE + 1; q < BOARD_SIZE; q++) {
    for (let r = -BOARD_SIZE + 1; r < BOARD_SIZE; r++) {
      const s = -q - r;
      if (Math.abs(s) >= BOARD_SIZE) continue;
      const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      let terrain: HexCell["terrain"] = "plains";
      if (dist >= BOARD_SIZE - 1) terrain = "water";
      else if (rand() < 0.15) terrain = "forest";
      else if (rand() < 0.05) terrain = "mountain";
      cells.push({
        position: { q, r, s },
        terrain,
        elevation: terrain === "mountain" ? 2 : terrain === "forest" ? 1 : 0,
        controlledBy: null,
      });
    }
  }
  return cells;
}

export function createMatch(seed: string, sideA: string, sideB: string): MatchState {
  const rand = seededRandom(seed);
  const units = makeUnits("A", rand);
  const visible = makeBoard(rand);
  return {
    seed,
    turn: 0,
    yourTurn: true,
    units,
    visible,
    score: { A: 0, B: 0 },
    deadline: Date.now() + 120000,
  };
}

export function stepMatch(
  state: MatchState,
  actionA: AgentAction,
  actionB: AgentAction
): MatchResult {
  const events: MatchEvent[] = [];
  let ended = false;

  const nextState = advanceTurn(state, actionA, actionB);
  events.push({ type: "turn_advanced", turn: nextState.turn, data: null });

  const victory = checkVictory(nextState);
  if (victory.winner !== null) {
    ended = true;
    events.push({ type: "victory", turn: nextState.turn, data: victory });
  }

  return { state: nextState, events, ended };
}

export function computeMatchHash(state: MatchState): string {
  const canonical: MatchState = {
    ...state,
    units: [...state.units].sort((a, b) => a.id.localeCompare(b.id)),
    visible: [...state.visible].sort((a, b) => {
      const aq = a.position.q, ar = a.position.r, as = a.position.s;
      const bq = b.position.q, br = b.position.r, bs = b.position.s;
      const ak = aq * 10000 + ar * 100 + as;
      const bk = bq * 10000 + br * 100 + bs;
      return ak - bk;
    }),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}