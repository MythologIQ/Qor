import type { AgentRoundBudget, RoundPlan } from "../shared/types";
import { AP_CAP, BASE_AP, MAX_CARRY } from "./constants";

export function newBudget(): AgentRoundBudget {
  return { freeMove: 1, freeAction: 1, apPool: BASE_AP, apCarry: 0 };
}

export function applyCarryover(prev: AgentRoundBudget): AgentRoundBudget {
  const apPool = Math.min(BASE_AP + prev.apCarry, AP_CAP);
  return { freeMove: 1, freeAction: 1, apPool, apCarry: 0 };
}

export function deductBid(budget: AgentRoundBudget, bid: number): AgentRoundBudget {
  const burn = Math.min(Math.max(bid, 0), budget.apPool);
  return { ...budget, apPool: budget.apPool - burn };
}

/**
 * Apply end-of-round: refund unused free slots back to the apPool (capped at
 * AP_CAP), then derive next-round carry as min(apPool, MAX_CARRY). Zeroes
 * free slots on the returned budget so the next round's applyCarryover starts
 * clean.
 */
export function applyEndOfRound(current: AgentRoundBudget): AgentRoundBudget {
  const refund = (current.freeMove > 0 ? 1 : 0) + (current.freeAction > 0 ? 1 : 0);
  const apPoolAfter = Math.min(current.apPool + refund, AP_CAP);
  const apCarry = Math.min(Math.max(apPoolAfter, 0), MAX_CARRY);
  return { freeMove: 0, freeAction: 0, apPool: apPoolAfter, apCarry };
}

/**
 * Safe fallback RoundPlan for timeout/close forfeit paths. Exported here so
 * runner + tests share the exact constant.
 */
export const PASS_PLAN: RoundPlan = { bid: 0, extras: [] };
