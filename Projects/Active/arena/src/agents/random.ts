// Random Agent — HexaWars (Plan D v2)
// Emits a RoundPlan each round with a seeded PRNG for repeatability.
// Bids a random value in [BID_MIN, budget.apPool]; extras always [].

import type {
  CubeCoord,
  MatchState,
  RoundPlan,
  AgentRoundBudget,
} from '../shared/types';
import { BID_MIN, MOVE_POINTS, RANGE } from '../engine/constants';
import { BaseAgent } from './base';

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  let s = h >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubeDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s),
  );
}

export class RandomAgent extends BaseAgent {
  private rng: () => number;

  constructor(id: string, seed?: string) {
    super(id, '1.0');
    this.rng = seededRandom(seed ?? id);
  }

  getRoundPlan(state: MatchState, budget: AgentRoundBudget): RoundPlan {
    const side: "A" | "B" = "A";
    const myUnits = state.units.filter(u => u.owner === side);
    const bidMax = Math.max(BID_MIN, budget.apPool);
    const bid = BID_MIN + Math.floor(this.rng() * (bidMax - BID_MIN + 1));

    if (myUnits.length === 0) return { bid, extras: [] };

    const unit = myUnits[Math.floor(this.rng() * myUnits.length)]!;
    const attackTargets = state.visible.filter(
      (cell) =>
        Boolean(cell.unit && cell.unit.owner !== side) &&
        cubeDistance(unit.position, cell.position) <= RANGE[unit.type],
    );
    const moveTargets = state.visible.filter(
      (cell) =>
        !cell.unit &&
        cubeDistance(unit.position, cell.position) === MOVE_POINTS[unit.type],
    );

    if (attackTargets.length === 0 && moveTargets.length === 0) {
      return { bid, extras: [] };
    }

    const roll = this.rng();

    if (roll < 0.7 && moveTargets.length > 0) {
      const target = moveTargets[Math.floor(this.rng() * moveTargets.length)]!;
      return {
        bid,
        extras: [],
        freeMove: { unitId: unit.id, from: unit.position, to: target.position },
      };
    }
    if (attackTargets.length > 0) {
      const enemy = attackTargets[Math.floor(this.rng() * attackTargets.length)]!;
      return {
        bid,
        extras: [],
        freeAction: {
          unitId: unit.id,
          type: 'attack',
          from: unit.position,
          to: enemy.position,
        },
      };
    }

    const target = moveTargets[Math.floor(this.rng() * moveTargets.length)]!;
    return {
      bid,
      extras: [],
      freeMove: { unitId: unit.id, from: unit.position, to: target.position },
    };
  }
}
