// Plan D v2 Phase 5 — Reserve Trigger and Interrupt Semantics
// Resolves reserve overwatch triggers before free moves/actions fire.

import type {
  MatchState,
  RoundPlan,
  Unit,
  CubeCoord,
  ReserveRecord,
  EngineEvent,
} from "../../shared/types";
import { RANGE } from "../constants";

export interface TriggerResult {
  kind: "attack" | "second_attack" | "movement_in_range";
  sourceUnitId: string;
  sourceAgent: "A" | "B";
}

/**
 * Find the first reserve trigger for a reserving unit across both plans.
 * Checks in winner-first order per Phase 5 spec.
 * Returns null if no trigger is found.
 */
export function findReserveTrigger(
  reservingUnit: Unit,
  planA: RoundPlan,
  planB: RoundPlan,
  bidWinner: "A" | "B",
): TriggerResult | null {
  const [firstPlan, secondPlan, firstAgent, secondAgent] =
    bidWinner === "A"
      ? [planA, planB, "A" as const, "B" as const]
      : [planB, planA, "B" as const, "A" as const];

  const first = checkPlan(firstPlan, firstAgent, reservingUnit);
  if (first) return first;

  const second = checkPlan(secondPlan, secondAgent, reservingUnit);
  if (second) return second;

  return null;
}

function checkPlan(
  plan: RoundPlan,
  agent: "A" | "B",
  reservingUnit: Unit,
): TriggerResult | null {
  // Trigger 1: freeAction.type === "attack" targeting reserving unit's position
  if (plan.freeAction && plan.freeAction.type === "attack") {
    if (samePos(plan.freeAction.to, reservingUnit.position)) {
      return { kind: "attack", sourceUnitId: plan.freeAction.unitId, sourceAgent: agent };
    }
  }

  // Trigger 2: any second_attack extra targeting reserving unit's position
  for (const extra of plan.extras) {
    if (extra.kind === "second_attack" && extra.to && samePos(extra.to, reservingUnit.position)) {
      return { kind: "second_attack", sourceUnitId: extra.unitId, sourceAgent: agent };
    }
  }

  // Trigger 3: any freeMove whose final hex is within RANGE[type] of reserving unit
  if (plan.freeMove) {
    const finalHex = lastHex(plan.freeMove);
    if (finalHex) {
      const range = RANGE[reservingUnit.type] ?? 1;
      if (hexDistance(finalHex, reservingUnit.position) <= range) {
        return { kind: "movement_in_range", sourceUnitId: plan.freeMove.unitId, sourceAgent: agent };
      }
    }
  }

  return null;
}

/**
 * Apply reserve damage: full strength, no terrain reduction, no defender retaliation.
 * Returns updated units array (dead units marked with hp <= 0).
 */
export function applyReserveDamage(
  state: MatchState,
  reservingUnit: Unit,
  target: Unit,
): MatchState {
  const damage = reservingUnit.strength;
  const targetHp = Math.max(0, target.hp - damage);
  const isDead = targetHp <= 0;

  const nextUnits = state.units.map((u) => {
    if (u.id === target.id) return { ...u, hp: targetHp };
    return u;
  });

  return { ...state, units: nextUnits };
}

/**
 * Walk planA and planB, remove any planned action referencing deadUnitId,
 * emit waste events for each removed action.
 */
export function flagPlannedActionsWasted(
  planA: RoundPlan,
  planB: RoundPlan,
  deadUnitId: string,
  events: EngineEvent[],
): void {
  flagAgent(planA, "A", deadUnitId, events);
  flagAgent(planB, "B", deadUnitId, events);
}

function flagAgent(
  plan: RoundPlan,
  agent: "A" | "B",
  deadUnitId: string,
  events: EngineEvent[],
): void {
  // freeMove
  if (plan.freeMove && plan.freeMove.unitId === deadUnitId) {
    events.push({
      type: "wasted_action",
      payload: { agent, kind: "freeMove", originalUnitId: deadUnitId, reason: "trigger_killed_unit" },
      timestamp: 0,
    });
    // Remove it — we can't actually mutate the plan here since it's passed by
    // reference; caller is responsible for clearing. We emit the event only.
  }

  // freeAction
  if (plan.freeAction && plan.freeAction.unitId === deadUnitId) {
    events.push({
      type: "wasted_action",
      payload: { agent, kind: "freeAction", originalUnitId: deadUnitId, reason: "trigger_killed_unit" },
      timestamp: 0,
    });
  }

  // extras
  for (const extra of plan.extras) {
    if (extra.unitId === deadUnitId) {
      events.push({
        type: "wasted_action",
        payload: { agent, kind: "extra", originalUnitId: deadUnitId, reason: "trigger_killed_unit" },
        timestamp: 0,
      });
    }
  }
}

/**
 * Resolve all reserve triggers for the current round.
 * Fires before free moves and free actions resolve (Phase 5 order).
 * Reserves that fire mark fired=true; killed-source actions emit wasted_action.
 */
export function resolveReserveTriggers(
  state: MatchState,
  planA: RoundPlan,
  planB: RoundPlan,
  bidWinner: "A" | "B",
  currentRound: number,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const reserves = state.reserves ?? [];

  for (const reserve of reserves) {
    if (reserve.appliesOnRound !== currentRound) continue;
    if (reserve.fired) continue;

    const reservingUnit = state.units.find((u) => u.id === reserve.unitId);
    if (!reservingUnit || reservingUnit.hp <= 0) {
      // Unit died before trigger evaluated — mark fired for cleanup
      reserve.fired = true;
      continue;
    }

    const trigger = findReserveTrigger(reservingUnit, planA, planB, bidWinner);
    if (!trigger) continue;

    const target = state.units.find((u) => u.id === trigger.sourceUnitId);
    if (!target) continue;

    // Apply damage (no terrain, no retaliation)
    const nextState = applyReserveDamage(state, reservingUnit, target);
    const targetAfter = nextState.units.find((u) => u.id === target.id);
    const killed = targetAfter ? targetAfter.hp <= 0 : false;

    events.push({
      type: "reserve_fired",
      payload: {
        reserver: reservingUnit.id,
        target: target.id,
        damage: reservingUnit.strength,
        triggerKind: trigger.kind,
      },
      timestamp: 0,
    });

    if (killed && targetAfter) {
      // Mark target dead in state (mutate directly since we're walking reserves)
      const deadIdx = state.units.findIndex((u) => u.id === target.id);
      if (deadIdx >= 0) state.units[deadIdx] = { ...state.units[deadIdx], hp: 0 };

      // Flag the triggering action as wasted (AP not refunded per R4)
      const wasteEvents = buildWastedEvents(planA, planB, target.id, trigger.sourceAgent);
      events.push(...wasteEvents);
    }

    reserve.fired = true;
  }

  return events;
}

function buildWastedEvents(
  planA: RoundPlan,
  planB: RoundPlan,
  deadUnitId: string,
  sourceAgent: "A" | "B",
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const plan = sourceAgent === "A" ? planA : planB;
  const agent = sourceAgent;

  if (plan.freeMove && plan.freeMove.unitId === deadUnitId) {
    events.push({
      type: "wasted_action",
      payload: { agent, kind: "freeMove", originalUnitId: deadUnitId, reason: "trigger_killed_unit" },
      timestamp: 0,
    });
  }
  if (plan.freeAction && plan.freeAction.unitId === deadUnitId) {
    events.push({
      type: "wasted_action",
      payload: { agent, kind: "freeAction", originalUnitId: deadUnitId, reason: "trigger_killed_unit" },
      timestamp: 0,
    });
  }
  for (const extra of plan.extras) {
    if (extra.unitId === deadUnitId) {
      events.push({
        type: "wasted_action",
        payload: { agent, kind: "extra", originalUnitId: deadUnitId, reason: "trigger_killed_unit" },
        timestamp: 0,
      });
    }
  }

  return events;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function samePos(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

function lastHex(move: RoundPlan["freeMove"]): CubeCoord | null {
  if (!move) return null;
  if (move.path && move.path.length > 0) return move.path[move.path.length - 1];
  if (move.to) return move.to;
  return null;
}
