import type { AgentRoundBudget } from "../shared/types";
import { AP_CAP, BASE_AP, MAX_CARRY } from "./constants";

export function newBudget(): AgentRoundBudget {
  return { freeMove: 1, freeAction: 1, apPool: BASE_AP, apCarry: 0 };
}

export function applyCarryover(prev: AgentRoundBudget): AgentRoundBudget {
  const apPool = Math.min(BASE_AP + prev.apCarry, AP_CAP);
  return { freeMove: 1, freeAction: 1, apPool, apCarry: 0 };
}

export function roundEndCarryover(current: AgentRoundBudget): number {
  return Math.min(Math.max(current.apPool, 0), MAX_CARRY);
}

export function deductBid(budget: AgentRoundBudget, bid: number): AgentRoundBudget {
  const burn = Math.min(Math.max(bid, 0), budget.apPool);
  return { ...budget, apPool: budget.apPool - burn };
}
