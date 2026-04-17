import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import type { MatchState, AgentAction, Unit, HexCell } from "../../src/shared/types.ts";
import { advanceTurn } from "../../src/engine/turns.ts";
import { checkVictory } from "../../src/engine/victory.ts";

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
      units.push({ id: `${side}-${q}-${r}-${s}`, owner: side, role, position: { q, r, s }, strength: 100, hp: 100 });
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
      let terrain: HexCell["terrain"] = "plain";
      if (dist >= BOARD_SIZE - 1) terrain = "water";
      else if (rand() < 0.15) terrain = "forest";
      else if (rand() < 0.05) terrain = "mountain";
      cells.push({ position: { q, r, s }, terrain, elevation: terrain === "mountain" ? 2 : terrain === "forest" ? 1 : 0, controlledBy: null });
    }
  }
  return cells;
}

function createMatch(seed: string): MatchState {
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
    deadline: 120000,
  };
}

function computeMatchHash(state: MatchState): string {
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

function makeScriptedActions(): AgentAction[] {
  const moves = [
    { from: { q: 0, r: 0, s: 0 }, to: { q: 0, r: 1, s: -1 } },
    { from: { q: 0, r: 1, s: -1 }, to: { q: 0, r: 2, s: -2 } },
    { from: { q: 0, r: 2, s: -2 }, to: { q: 0, r: 3, s: -3 } },
    { from: { q: 1, r: 0, s: -1 }, to: { q: 1, r: 1, s: -2 } },
    { from: { q: 1, r: 1, s: -2 }, to: { q: 1, r: 2, s: -3 } },
  ];
  return moves.map((m) => ({ type: "move" as const, from: m.from, to: m.to, confidence: 1.0 }));
}

interface RunResult {
  finalHash: string;
  turnHashes: string[];
}

function runMatch(seed: string): RunResult {
  const state = createMatch(seed);
  const actions = makeScriptedActions();
  const turnHashes: string[] = [];
  let currentState = state;
  turnHashes.push(computeMatchHash(currentState));
  for (const action of actions) {
    const nextState = advanceTurn(currentState, action, action);
    const victory = checkVictory(nextState);
    currentState = nextState;
    turnHashes.push(computeMatchHash(currentState));
    if (victory.winner !== null) break;
  }
  return { finalHash: computeMatchHash(currentState), turnHashes };
}

describe("match determinism", () => {
  const seed = "test-seed-12345";

  it("produces identical final match hash across 3 runs", () => {
    const run1 = runMatch(seed);
    const run2 = runMatch(seed);
    const run3 = runMatch(seed);
    expect(run1.finalHash).toBe(run2.finalHash);
    expect(run2.finalHash).toBe(run3.finalHash);
  });

  it("produces identical turn-by-turn state hashes across 3 runs", () => {
    const run1 = runMatch(seed);
    const run2 = runMatch(seed);
    const run3 = runMatch(seed);
    expect(run1.turnHashes).toEqual(run2.turnHashes);
    expect(run2.turnHashes).toEqual(run3.turnHashes);
  });

  it("final match hash is non-empty", () => {
    const run1 = runMatch(seed);
    expect(run1.finalHash.length).toBe(64);
  });

  it("turn hashes are all non-empty sha256", () => {
    const run1 = runMatch(seed);
    for (const h of run1.turnHashes) {
      expect(h.length).toBe(64);
    }
  });

  it("different seeds produce different final hashes", () => {
    const runA = runMatch("seed-alpha");
    const runB = runMatch("seed-beta");
    expect(runA.finalHash).not.toBe(runB.finalHash);
  });
});