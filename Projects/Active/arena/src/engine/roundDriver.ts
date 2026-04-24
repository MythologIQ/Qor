import { resolveBids } from "./bidResolver";
import { findRetarget } from "./retarget";
import { resolveCombat } from "./combat";
import { applyCarryover, applyEndOfRound, deductBid } from "./round-state";
import { resolveExtras } from "./round-resolver/extras.ts";
import { resolveReserveTriggers } from "./round-resolver/triggers.ts";
import { RANGE } from "./constants";
import { checkVictory } from "./victory";
import type {
  RunRoundInput,
  RunRoundResult,
  EngineEvent,
  MatchState,
  AgentRoundBudget,
  RoundPlan,
  Unit,
  CubeCoord,
  HexCell,
} from "../shared/types.ts";

interface AgentOutcome {
  state: MatchState;
  budget: AgentRoundBudget;
  events: EngineEvent[];
}

export function runRound(input: RunRoundInput): RunRoundResult {
  const order = resolveBids({
    matchId: input.matchId,
    round: input.round,
    agentA: { bid: input.planA.bid, plan: input.planA },
    agentB: { bid: input.planB.bid, plan: input.planB },
  });

  // Phase 5: resolve reserve triggers BEFORE free moves/actions fire.
  // Fires on input.state (original state, not yet mutated by bids).
  // Returns reserve_fired + wasted_action events.
  const reserveEvents = resolveReserveTriggers(
    input.state,
    input.planA,
    input.planB,
    order.first,
    input.round,
  );

  // After reserve resolution, some units may have hp <= 0. Filter them out
  // so subsequent phase functions don't act with dead units.
  const liveUnits = input.state.units.map((u) => {
    // If reserve killed this unit, mark hp=0 and exclude from live set
    const killedByReserve = reserveEvents.some(
      (e) => e.type === "reserve_fired" && (e.payload as Record<string, unknown>).target === u.id,
    );
    if (killedByReserve) return { ...u, hp: 0 };
    return u;
  });
  const stateAfterReserve: MatchState = {
    ...input.state,
    units: liveUnits,
  };

  const startA = applyCarryover(deductBid(input.budgetA, input.planA.bid));
  const startB = applyCarryover(deductBid(input.budgetB, input.planB.bid));

  const firstAgent = order.first;
  const firstPlan = firstAgent === "A" ? input.planA : input.planB;
  const firstStart = firstAgent === "A" ? startA : startB;
  const firstOut = runAgent(firstAgent, firstPlan, stateAfterReserve, firstStart);

  const secondAgent: "A" | "B" = firstAgent === "A" ? "B" : "A";
  const secondPlan = firstAgent === "A" ? input.planB : input.planA;
  const secondStart = firstAgent === "A" ? startB : startA;
  const secondOut = runAgent(secondAgent, secondPlan, firstOut.state, secondStart);

  // Phase 4 AP extras: winner's extras first, then loser, preserving declared order.
  const boostFlag: Record<string, { mode: "range" | "damage" } | undefined> = {};
  const extrasCtx: import("./round-resolver/extras.ts").ExtrasContext = {
    state: secondOut.state,
    round: input.round,
    bidWinner: order.first,
    boostFlag,
    events: [],
    planA: input.planA,
    planB: input.planB,
  };
  resolveExtras(extrasCtx);

  const budgetAPre = firstAgent === "A" ? firstOut.budget : secondOut.budget;
  const budgetBPre = firstAgent === "A" ? secondOut.budget : firstOut.budget;
  const budgetA = applyEndOfRound(budgetAPre);
  const budgetB = applyEndOfRound(budgetBPre);

  const refundEvents = buildRefundEvents(input.budgetA, budgetA, input.budgetB, budgetB, input.round);
  const events = [
    ...reserveEvents,
    ...firstOut.events,
    ...secondOut.events,
    ...extrasCtx.events,
    ...refundEvents,
  ];

  const nextState: MatchState = { ...secondOut.state, turn: input.round + 1 };
  const victory = checkVictory(nextState);
  return {
    events,
    nextState,
    nextBudgetA: budgetA,
    nextBudgetB: budgetB,
    ended: victory.winner !== null,
  };
}

function runAgent(
  agent: "A" | "B",
  plan: RoundPlan,
  state: MatchState,
  budget: AgentRoundBudget,
): AgentOutcome {
  const events: EngineEvent[] = [];
  let nextState = state;
  let nextBudget = budget;

  // Skip dead units in plan references (they were killed by reserve trigger).
  // Per R4, AP was burned at validate time — no refund.
  const skipDead = (unitId: string) =>
    nextState.units.find((u) => u.id === unitId && u.hp <= 0) !== undefined;

  if (plan.freeMove && !skipDead(plan.freeMove.unitId)) {
    const moveOut = doMove(agent, plan.freeMove.unitId, plan.freeMove.to, nextState);
    if (moveOut) {
      nextState = moveOut.state;
      events.push(moveOut.event);
      nextBudget = { ...nextBudget, freeMove: Math.max(0, nextBudget.freeMove - 1) };
    }
  } else if (plan.freeMove && skipDead(plan.freeMove.unitId)) {
    events.push({
      type: "wasted_action",
      payload: { agent, kind: "freeMove", originalUnitId: plan.freeMove.unitId, reason: "trigger_killed_unit" },
      timestamp: 0,
    });
  }

  if (plan.freeAction && !skipDead(plan.freeAction.unitId) && plan.freeAction.type === "attack") {
    const atkOut = doAttack(agent, plan.freeAction.unitId, plan.freeAction.to, nextState);
    if (atkOut) {
      nextState = atkOut.state;
      events.push(...atkOut.events);
      nextBudget = { ...nextBudget, freeAction: Math.max(0, nextBudget.freeAction - 1) };
    }
  } else if (plan.freeAction && skipDead(plan.freeAction.unitId)) {
    events.push({
      type: "wasted_action",
      payload: { agent, kind: "freeAction", originalUnitId: plan.freeAction.unitId, reason: "trigger_killed_unit" },
      timestamp: 0,
    });
  }

  return { state: nextState, budget: nextBudget, events };
}

function doMove(
  agent: "A" | "B",
  unitId: string,
  to: CubeCoord,
  state: MatchState,
): { state: MatchState; event: EngineEvent } | null {
  const unit = state.units.find((u) => u.id === unitId && u.owner === agent);
  if (!unit) return null;
  const destOccupied = state.units.some((u) => samePos(u.position, to));
  if (destOccupied) return null;
  const destCell = state.visible.find((c) => samePos(c.position, to));
  if (!destCell) return null;
  if (destCell.terrain === "mountain" || destCell.terrain === "water") return null;

  const newPos: CubeCoord = { q: to.q, r: to.r, s: to.s };
  const movedUnit: Unit = { ...unit, position: newPos };
  const units = state.units.map((u) => (u.id === unitId ? movedUnit : u));
  const visible = state.visible.map((c) => {
    if (samePos(c.position, unit.position)) return { ...c, unit: undefined };
    if (samePos(c.position, to)) return { ...c, unit: movedUnit };
    return c;
  });
  const event: EngineEvent = {
    type: "unit_moved",
    payload: { agent, unitId, from: unit.position, to: newPos },
    timestamp: 0,
  };
  return { state: { ...state, units, visible }, event };
}

function doAttack(
  agent: "A" | "B",
  attackerUnitId: string,
  originalTarget: CubeCoord,
  state: MatchState,
): { state: MatchState; events: EngineEvent[] } | null {
  const attacker = state.units.find((u) => u.id === attackerUnitId && u.owner === agent);
  if (!attacker) return null;

  const directTarget = state.units.find(
    (u) => u.owner !== agent && samePos(u.position, originalTarget),
  );

  let defender: Unit | null = directTarget ?? null;
  let aimPenalty = 0;
  let retargeted = false;

  if (!defender) {
    const enemies = state.units.filter((u) => u.owner !== agent);
    const range = RANGE[attacker.type] ?? 1;
    defender = findRetarget({ attacker, originalTarget, enemyUnits: enemies, range });
    if (!defender) return { state, events: [] };
    retargeted = true;
    aimPenalty = (attacker.weight ?? 2) * 0.2;
  }

  const defenderCell = state.visible.find((c) => samePos(c.position, defender!.position));
  const terrain: HexCell["terrain"] = defenderCell?.terrain ?? "plain";
  const result = resolveCombat(attacker, defender, terrain, aimPenalty);

  const nextUnits: Unit[] = [];
  for (const u of state.units) {
    if (result.destroyed.includes(u.id)) continue;
    if (u.id === attacker.id) nextUnits.push({ ...u, hp: result.attackerHp });
    else if (u.id === defender.id) nextUnits.push({ ...u, hp: result.defenderHp });
    else nextUnits.push(u);
  }
  const nextVisible = state.visible.map((c) => {
    if (!c.unit) return c;
    if (result.destroyed.includes(c.unit.id)) return { ...c, unit: undefined };
    if (c.unit.id === attacker.id) return { ...c, unit: { ...c.unit, hp: result.attackerHp } };
    if (c.unit.id === defender!.id) return { ...c, unit: { ...c.unit, hp: result.defenderHp } };
    return c;
  });

  const events: EngineEvent[] = [];
  events.push({
    type: "unit_attacked",
    payload: {
      agent,
      attackerUnitId,
      targetUnitId: defender.id,
      damage: result.attackerHp !== attacker.hp ? attacker.strength : attacker.strength,
      defenderHp: result.defenderHp,
    },
    timestamp: 0,
  });
  if (retargeted) {
    events.push({
      type: "action_retargeted",
      payload: {
        agent,
        attackerUnitId,
        originalTarget,
        actualTarget: defender.position,
        actualTargetUnitId: defender.id,
        aimPenalty,
        reason: "rushed_shot",
      },
      timestamp: 0,
    });
  }
  for (const id of result.destroyed) {
    events.push({ type: "unit_destroyed", payload: { unitId: id }, timestamp: 0 });
  }

  return { state: { ...state, units: nextUnits, visible: nextVisible }, events };
}

function buildRefundEvents(
  prevA: AgentRoundBudget,
  nextA: AgentRoundBudget,
  prevB: AgentRoundBudget,
  nextB: AgentRoundBudget,
  round: number,
): EngineEvent[] {
  const out: EngineEvent[] = [];
  if (nextA.apPool > prevA.apPool) {
    out.push({
      type: "slots_refunded",
      payload: { agent: "A", round, delta: nextA.apPool - prevA.apPool },
      timestamp: 0,
    });
  }
  if (nextB.apPool > prevB.apPool) {
    out.push({
      type: "slots_refunded",
      payload: { agent: "B", round, delta: nextB.apPool - prevB.apPool },
      timestamp: 0,
    });
  }
  return out;
}

function samePos(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}
