// Greedy Agent — HexaWars
// Agent tier: D | phase: D
// Scores each possible action and picks the highest score.
// Scoring: move to unclaimed territory +2, attack enemy with HP advantage +3, default +0.
// Tie-break: unit id ascending, then target q ascending, then target r ascending.

import type { AgentAction, AgentActionType, CubeCoord, HexCell, MatchState, Unit } from '../shared/types';
import { BaseAgent } from './base';

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

interface ScoredAction {
  score: number;
  unitId: string;
  targetQ: number;
  targetR: number;
  action: AgentAction;
}

export class GreedyAgent extends BaseAgent {
  decide(state: MatchState): AgentAction {
    const myUnits = state.units.filter(u => u.owner === 'A');
    if (myUnits.length === 0) {
      return { type: 'pass', confidence: 1.0 };
    }

    // Collect all scored action candidates
    const candidates: ScoredAction[] = [];

    for (const unit of myUnits) {
      const adjacentCells = state.visible.filter(
        cell => cubeDistance(unit.position, cell.position) === 1
      );

      if (adjacentCells.length === 0) {
        // No adjacent cells: pass is the only option for this unit
        candidates.push({
          score: 0,
          unitId: unit.id,
          targetQ: unit.position.q,
          targetR: unit.position.r,
          action: { type: 'pass', from: unit.position, confidence: 1.0 },
        });
        continue;
      }

      for (const cell of adjacentCells) {
        const score = this.scoreAction(unit, cell);
        candidates.push({
          score,
          unitId: unit.id,
          targetQ: cell.position.q,
          targetR: cell.position.r,
          action: {
            type: this.actionTypeFor(cell, unit),
            from: unit.position,
            to: cell.position,
            confidence: 1.0,
          },
        });
      }
    }

    // Sort: highest score first, then tie-break deterministically
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.unitId !== b.unitId) return a.unitId.localeCompare(b.unitId);
      if (a.targetQ !== b.targetQ) return a.targetQ - b.targetQ;
      return a.targetR - b.targetR;
    });

    return candidates[0].action;
  }

  /** Score an action given the unit and target cell. */
  private scoreAction(unit: Unit, target: HexCell): number {
    // Attack enemy with HP advantage: +3
    if (target.unit && target.unit.owner !== 'A' && unit.hp > target.unit.hp) {
      return 3;
    }
    // Move to unclaimed territory: +2
    if (!target.unit && !target.controlledBy) {
      return 2;
    }
    // All other actions: +0
    return 0;
  }

  /** Determine action type for a target cell. */
  private actionTypeFor(cell: HexCell, unit: Unit): AgentActionType {
    if (cell.unit && cell.unit.owner !== 'A') {
      return 'attack';
    }
    return 'move';
  }
}