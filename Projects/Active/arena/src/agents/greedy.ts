// Greedy Agent — HexaWars (Plan D v2)
// Emits a RoundPlan each round. Picks the highest-scoring freeMove/freeAction
// pair for one owned unit: attack an adjacent enemy when hp-advantaged,
// otherwise move into an unclaimed neighbor. Bids 0.

import type {
  CubeCoord,
  HexCell,
  MatchState,
  Unit,
  RoundPlan,
  AgentRoundBudget,
} from '../shared/types';
import { MOVE_POINTS } from '../engine/constants';
import { BaseAgent } from './base';

function cubeDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s),
  );
}

interface ScoredCandidate {
  score: number;
  unitId: string;
  unit: Unit;
  target: CubeCoord;
  isAttack: boolean;
}

export class GreedyAgent extends BaseAgent {
  getRoundPlan(state: MatchState, _budget: AgentRoundBudget): RoundPlan {
    const side: "A" | "B" = "A";
    const myUnits = state.units.filter(u => u.owner === side);
    if (myUnits.length === 0) return { bid: 0, extras: [] };

    const candidates: ScoredCandidate[] = [];
    for (const unit of myUnits) {
      const adjacent = state.visible.filter(
        cell => cubeDistance(unit.position, cell.position) === 1,
      );
      for (const cell of adjacent) {
        const score = this.scoreCell(unit, cell, side);
        candidates.push({
          score,
          unitId: unit.id,
          unit,
          target: cell.position,
          isAttack: Boolean(cell.unit && cell.unit.owner !== side && unit.hp > cell.unit.hp),
        });
      }
    }

    if (candidates.length === 0) return { bid: 0, extras: [] };

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.unitId !== b.unitId) return a.unitId.localeCompare(b.unitId);
      if (a.target.q !== b.target.q) return a.target.q - b.target.q;
      return a.target.r - b.target.r;
    });

    const top = candidates[0]!;
    if (top.isAttack) {
      return {
        bid: 0,
        extras: [],
        freeAction: {
          unitId: top.unitId,
          type: 'attack',
          from: top.unit.position,
          to: top.target,
        },
      };
    }

    const moveDistance = MOVE_POINTS[top.unit.type];
    const moveTargets = state.visible
      .filter((cell) =>
        !cell.unit &&
        cubeDistance(top.unit.position, cell.position) === moveDistance,
      )
      .sort((a, b) => {
        if (a.position.q !== b.position.q) return a.position.q - b.position.q;
        return a.position.r - b.position.r;
      });

    if (moveTargets.length === 0) {
      return { bid: 0, extras: [] };
    }

    const moveTarget = moveTargets[0]!;
    return {
      bid: 0,
      extras: [],
      freeMove: {
        unitId: top.unitId,
        from: top.unit.position,
        to: moveTarget.position,
      },
    };
  }

  private scoreCell(unit: Unit, cell: HexCell, side: "A" | "B"): number {
    if (cell.unit && cell.unit.owner !== side && unit.hp > cell.unit.hp) return 3;
    if (!cell.unit && !cell.controlledBy) return 2;
    return 0;
  }
}
