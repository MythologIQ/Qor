// Random Agent — HexaWars
// Agent tier: D | phase: D
// Generates random valid actions using a seeded PRNG for repeatability

import type { AgentAction, AgentActionType, CubeCoord, MatchState, Unit } from '../shared/types';
import { BaseAgent } from './base';

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  // Mulberry32
  let s = h >>> 0;
  return () => {
    s |= 0;
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function cubeDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s)
  );
}

function cubeNeighbors(c: CubeCoord): CubeCoord[] {
  return [
    { q: c.q + 1, r: c.r - 1, s: c.s },
    { q: c.q + 1, r: c.r, s: c.s - 1 },
    { q: c.q, r: c.r + 1, s: c.s - 1 },
    { q: c.q - 1, r: c.r + 1, s: c.s },
    { q: c.q - 1, r: c.r, s: c.s + 1 },
    { q: c.q, r: c.r - 1, s: c.s + 1 },
  ];
}

export class RandomAgent extends BaseAgent {
  private rng: () => number;

  constructor(id: string, seed?: string) {
    const s = seed ?? id;
    super(id, '1.0');
    this.rng = seededRandom(s);
  }

  decide(state: MatchState): AgentAction {
    // Pick a random unit we own
    const myUnits = state.units.filter(u => u.owner === 'A');
    if (myUnits.length === 0) {
      return { type: 'pass', confidence: 1.0 };
    }

    const unit = myUnits[Math.floor(this.rng() * myUnits.length)];

    // Determine valid targets from visible cells
    const validTargets = state.visible
      .map(cell => cell.position)
      .filter(pos => cubeDistance(unit.position, pos) === 1);

    // If no adjacent cells visible, pass
    if (validTargets.length === 0) {
      return { type: 'pass', from: unit.position, confidence: 0.9 };
    }

    // Random action type: move, attack, or pass
    const roll = this.rng();
    let actionType: AgentActionType;
    let target: CubeCoord;

    if (roll < 0.5) {
      // move
      actionType = 'move';
      target = validTargets[Math.floor(this.rng() * validTargets.length)];
    } else if (roll < 0.8) {
      // attack — target is a cell with an enemy unit
      const enemyCells = state.visible.filter(
        cell => cell.unit && cell.unit.owner !== 'A' &&
               cubeDistance(unit.position, cell.position) === 1
      );
      if (enemyCells.length > 0) {
        actionType = 'attack';
        target = enemyCells[Math.floor(this.rng() * enemyCells.length)].position;
      } else {
        actionType = 'move';
        target = validTargets[Math.floor(this.rng() * validTargets.length)];
      }
    } else {
      return { type: 'pass', from: unit.position, confidence: 0.9 };
    }

    return {
      type: actionType,
      from: unit.position,
      to: target,
      confidence: 0.7 + this.rng() * 0.3,
    };
  }
}