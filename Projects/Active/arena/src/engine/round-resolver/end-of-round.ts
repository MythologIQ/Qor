// Plan D v2 Phase 6 — End-of-Round State Cleanup (G2 + G3)
// emitRoundEnd: in fixed order — AP carryover, G2 stance cleanup,
// G3 reserve cleanup, increment round counter, emit round_ended event.
// Per R4: this function does not re-validate any domain rule.

import type { MatchState, EngineEvent, StanceRecord, ReserveRecord, AgentRoundBudget } from "../../shared/types";
import { MAX_CARRY, BASE_AP, AP_CAP } from "../constants";

export interface EmitRoundEndInput {
  state: MatchState;
  round: number; // the round that is ending
  budgetA: AgentRoundBudget;
  budgetB: AgentRoundBudget;
}

export interface EmitRoundEndResult {
  nextState: MatchState;
  events: EngineEvent[];
}

/** AP carryover helper — capped at MAX_CARRY per round economy rules */
function roundEndCarryover(budget: AgentRoundBudget): number {
  return Math.min(Math.max(budget.apPool, 0), MAX_CARRY);
}

/** Shallow snapshot of the round-relevant subset of MatchState for the round_ended event */
function shallowSnapshot(state: MatchState, round: number): MatchState {
  return {
    turn: round,
    visible: state.visible,
    units: state.units,
    score: { ...state.score },
    deadline: state.deadline,
    roundCap: state.roundCap,
    stances: state.stances ? [...state.stances] : [],
    reserves: state.reserves ? [...state.reserves] : [],
  };
}

/**
 * emitRoundEnd — G2 + G3 cleanup + AP carryover + round_ended emission.
 * Called once per round after all agent actions and AP extras have resolved.
 *
 * Fixed order:
 * 1. AP carryover
 * 2. G2 — remove StanceRecord with appliesOnRound <= currentRound
 * 3. G3 — remove ReserveRecord with appliesOnRound <= currentRound (regardless of fired)
 * 4. Increment round counter
 * 5. Emit round_ended event with { round, state }
 */
export function emitRoundEnd(input: EmitRoundEndInput): EmitRoundEndResult {
  const { state, round, budgetA, budgetB } = input;
  const currentRound = round;

  // 1. AP carryover
  const nextBudgets = {
    A: carryoverBudget(budgetA),
    B: carryoverBudget(budgetB),
  };

  // 2. G2 — remove expired stances
  const nextStances = (state.stances ?? []).filter(
    (s: StanceRecord) => s.appliesOnRound > currentRound,
  );

  // 3. G3 — remove expired reserves (regardless of fired flag)
  const nextReserves = (state.reserves ?? []).filter(
    (r: ReserveRecord) => r.appliesOnRound > currentRound,
  );

  // 4. Increment round counter
  const nextRound = currentRound + 1;

  // 5. Build next state
  const nextState: MatchState = {
    ...state,
    turn: nextRound,
    stances: nextStances,
    reserves: nextReserves,
  };

  // 6. Emit round_ended event
  const events: EngineEvent[] = [
    {
      type: "round_ended",
      payload: {
        round: currentRound,
        state: shallowSnapshot(state, currentRound),
      },
      timestamp: 0,
    },
  ];

  return { nextState, events };
}

function carryoverBudget(budget: AgentRoundBudget): AgentRoundBudget {
  const apPool = Math.min(BASE_AP + roundEndCarryover(budget), AP_CAP);
  return { freeMove: 1, freeAction: 1, apPool, apCarry: roundEndCarryover(budget) };
}