// Spectator Truth Completion — Plan spectator-truth-v1
// MatchRuntime: extracted class with snapshot accessor + active-registry

import { createMatch } from "../engine/match.ts";
import { runRound } from "../engine/roundDriver.ts";
import { newBudget } from "../engine/round-state.ts";
import { ROUND_CAP } from "../engine/constants.ts";
import type {
  MatchState,
  AgentRoundBudget,
  RoundPlan,
  EngineEvent,
  HexCell,
  Unit,
} from "../shared/types.ts";
import { agentSessionManager, type AgentSessionManager } from "../gateway/session.ts";
import { eventBus } from "./events.ts";
import {
  PROTOCOL_VERSION,
  type HelloFrame,
  type StateFrame,
  type EventFrame,
  type EndFrame,
} from "../gateway/contract.ts";

export interface MatchRunnerMetrics {
  totalTurns: number;
  winner: "A" | "B" | null;
  durationMs: number;
  actionsA: number;
  actionsB: number;
  invalidActions: number;
}

export interface AgentSnapshot {
  operator: string;
  modelId: string;
  totalMs: number;
  totalActions: number;
  invalidCount: number;
}

export interface SpectatorSnapshot {
  matchId: string;
  state: MatchState;
  budgetA: AgentRoundBudget;
  budgetB: AgentRoundBudget;
  round: number;
  agents: { A: AgentSnapshot; B: AgentSnapshot };
  events: EngineEvent[];
}

function seedNumeric(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const activeRuntimes = new Map<string, MatchRuntime>();

export function getActiveRuntime(matchId: string): MatchRuntime | undefined {
  return activeRuntimes.get(matchId);
}

function makeSeededPlanAgent(rand: () => number) {
  return function seededPlan(state: MatchState, side: "A" | "B"): RoundPlan {
    const myUnits = state.units.filter((u) => u.owner === side);
    if (myUnits.length === 0) return { bid: 0, extras: [] };
    const unit = myUnits[Math.floor(rand() * myUnits.length)]!;
    return {
      bid: 0,
      extras: [],
      freeMove: {
        unitId: unit.id,
        from: unit.position,
        to: { q: unit.position.q + 1, r: unit.position.r, s: -unit.position.q - 1 - unit.position.r },
      },
    };
  };
}

export class MatchRuntime {
  readonly matchId: string;
  state: MatchState;
  budgetA: AgentRoundBudget;
  budgetB: AgentRoundBudget;
  round = 0;
  events: EngineEvent[] = [];
  agents: { A: AgentSnapshot; B: AgentSnapshot };
  metrics: MatchRunnerMetrics;
  private startMs: number;
  private ended = false;

  constructor(
    matchId: string,
    seed: string,
    sessionA: string,
    sessionB: string,
  ) {
    this.matchId = matchId;
    this.state = createMatch(seed, sessionA, sessionB);
    this.budgetA = newBudget();
    this.budgetB = newBudget();
    this.startMs = Date.now();
    this.agents = {
      A: { operator: sessionA, modelId: "seeded", totalMs: 0, totalActions: 0, invalidCount: 0 },
      B: { operator: sessionB, modelId: "seeded", totalMs: 0, totalActions: 0, invalidCount: 0 },
    };
    this.metrics = {
      totalTurns: 0, winner: null,
      durationMs: 0, actionsA: 0, actionsB: 0, invalidActions: 0,
    };
    activeRuntimes.set(matchId, this);
  }

  getSpectatorSnapshot(): SpectatorSnapshot {
    return {
      matchId: this.matchId,
      state: {
        turn: this.state.turn,
        visible: this.state.visible.map((c) => ({ ...c, unit: c.unit ? { ...c.unit } : undefined })),
        units: this.state.units.map((u) => ({ ...u })),
        score: { ...this.state.score },
        deadline: this.state.deadline,
        roundCap: this.state.roundCap,
      },
      budgetA: { ...this.budgetA },
      budgetB: { ...this.budgetB },
      round: this.round,
      agents: {
        A: { ...this.agents.A },
        B: { ...this.agents.B },
      },
      events: this.events.map((e) => ({ ...e, payload: { ...e.payload } })),
    };
  }

  advanceRound(planA: RoundPlan, planB: RoundPlan): { ended: boolean } {
    if (this.ended) return { ended: true };

    const result = runRound({
      matchId: this.matchId,
      round: this.round,
      state: this.state,
      planA,
      planB,
      budgetA: this.budgetA,
      budgetB: this.budgetB,
    });

    this.state = result.nextState;
    this.budgetA = result.nextBudgetA;
    this.budgetB = result.nextBudgetB;
    this.events.push(...result.events);
    this.round++;
    this.metrics.totalTurns++;

    if (planA.freeMove || planA.freeAction) this.metrics.actionsA++;
    if (planB.freeMove || planB.freeAction) this.metrics.actionsB++;

    if (result.ended) {
      const unitCountA = this.state.units.filter((u) => u.owner === "A").length;
      const unitCountB = this.state.units.filter((u) => u.owner === "B").length;
      if (unitCountA > 0 && unitCountB === 0) this.metrics.winner = "A";
      else if (unitCountB > 0 && unitCountA === 0) this.metrics.winner = "B";
      this.ended = true;
    }

    return { ended: this.ended };
  }

  finish(): MatchRunnerMetrics {
    this.metrics.durationMs = Date.now() - this.startMs;
    activeRuntimes.delete(this.matchId);
    return { ...this.metrics };
  }
}

export async function runMatch(
  sessionA: string,
  sessionB: string,
  seed: string,
  eventBusInstance?: typeof eventBus,
  metricsBus?: {
    recordRound: (round: number, planA: RoundPlan, planB: RoundPlan) => void;
    recordEnd: (metrics: MatchRunnerMetrics) => void;
  },
  sessionMgrOverride?: AgentSessionManager,
): Promise<MatchRunnerMetrics> {
  const bus = eventBusInstance ?? eventBus;
  const matchId = sessionA.split(":")[0] ?? "match";
  const asm = sessionMgrOverride ?? agentSessionManager;

  const rt = new MatchRuntime(matchId, seed, sessionA, sessionB);

  const helloFrame: HelloFrame = {
    type: "HELLO",
    matchId,
    side: "A",
    seed,
    boardSize: { width: 7, height: 7 },
    timeBudgetMs: 5000,
    protocolVersion: PROTOCOL_VERSION,
  };
  bus.publish(sessionA, helloFrame);
  bus.publish(sessionB, { ...helloFrame, side: "B" });

  const sA = asm.getSession(sessionA);
  const sB = asm.getSession(sessionB);
  const isDryRun = sA?.status === "connected" && sB?.status === "connected";

  if (isDryRun) {
    asm.transition(sessionA, "playing");
    asm.transition(sessionB, "playing");
  } else {
    const ready = await new Promise<boolean>((resolve) => {
      let readyA = false;
      let readyB = false;
      const timer = setTimeout(() => resolve(false), 5000);
      const interval = setInterval(() => {
        const sa = asm.getSession(sessionA);
        const sb = asm.getSession(sessionB);
        if (sa?.status === "ready") readyA = true;
        if (sb?.status === "ready") readyB = true;
        if (readyA && readyB) { clearTimeout(timer); clearInterval(interval); resolve(true); }
      }, 50);
    });
    if (!ready) {
      asm.forfeit(sessionA, "ready-timeout");
      asm.forfeit(sessionB, "ready-timeout");
      return rt.finish();
    }
    asm.transition(sessionA, "playing");
    asm.transition(sessionB, "playing");
  }

  const randFn = (() => {
    let h = seedNumeric(seed);
    return () => {
      h ^= h << 13; h ^= h >> 17; h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };
  })();
  const planFnA = makeSeededPlanAgent(randFn);
  const planFnB = makeSeededPlanAgent(randFn);

  while (rt.round < ROUND_CAP) {
    const planA = planFnA(rt.state, "A");
    const planB = planFnB(rt.state, "B");
    asm.recordAction(sessionA, 0);
    asm.recordAction(sessionB, 0);

    const stateFrame: StateFrame = {
      type: "STATE",
      turn: rt.state.turn,
      units: rt.state.units,
      visible: rt.state.visible,
      score: rt.state.score,
      deadline: rt.state.deadline,
      roundCap: rt.state.roundCap,
      budget: rt.budgetA,
    };
    bus.publish(sessionA, stateFrame);
    bus.publish(sessionB, { ...stateFrame, budget: rt.budgetB });

    const { ended } = rt.advanceRound(planA, planB);
    bus.publish(sessionA, { type: "round_advanced", round: rt.round, data: null } as unknown as EventFrame);
    bus.publish(sessionB, { type: "round_advanced", round: rt.round, data: null } as unknown as EventFrame);

    if (metricsBus) metricsBus.recordRound(rt.round, planA, planB);
    if (ended) break;
  }

  const finalMetrics = rt.finish();

  const endFrame: EndFrame = {
    type: "END",
    matchId,
    winner: finalMetrics.winner,
    reason: finalMetrics.winner !== null ? "victory" : "draw",
    metrics: {
      totalActions: finalMetrics.actionsA,
      invalidActions: finalMetrics.invalidActions,
      avgDecisionMs: finalMetrics.durationMs / Math.max(finalMetrics.totalTurns, 1),
      totalMs: finalMetrics.durationMs,
    },
  };
  bus.publish(sessionA, endFrame);
  bus.publish(sessionB, { ...endFrame });

  if (finalMetrics.winner === "A") {
    asm.transition(sessionA, "ended");
    asm.forfeit(sessionB, "match-lost");
  } else if (finalMetrics.winner === "B") {
    asm.forfeit(sessionA, "match-lost");
    asm.transition(sessionB, "ended");
  } else {
    asm.forfeit(sessionA, "draw");
    asm.forfeit(sessionB, "draw");
  }

  if (metricsBus) metricsBus.recordEnd(finalMetrics);
  return finalMetrics;
}
