import type { Database } from "bun:sqlite";
import type { MatchRecord, MatchState, AgentRoundBudget, RoundPlan } from "../shared/types.ts";
import { createMatch } from "../engine/match.ts";
import { runRound } from "../engine/roundDriver.ts";
import { newBudget, PASS_PLAN } from "../engine/round-state.ts";
import { ROUND_CAP } from "../engine/constants.ts";
import { validateRoundPlan } from "../gateway/validator.ts";
import { checkVictory } from "../engine/victory.ts";
import {
  saveMatch,
  appendEvents,
  updateForfeit,
  updateMatchOutcome,
} from "../persistence/match-store.ts";
import type {
  RunnerContext,
  AgentChannel,
  RunnerResult,
  MatchConclusionReason,
} from "./types.ts";

const DEFAULT_TURN_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  return Promise.race([
    promise.then((value) => ({ ok: true as const, value })),
    new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), ms)),
  ]);
}

function isRoundPlanMessage(message: unknown): message is { plan: RoundPlan } {
  return Boolean(
    message &&
    typeof message === "object" &&
    "plan" in message &&
    (message as { plan?: unknown }).plan &&
    typeof (message as { plan?: RoundPlan }).plan?.bid === "number",
  );
}

function isLegacyActionMessage(message: unknown): message is { action: { type: string } } {
  return Boolean(
    message &&
    typeof message === "object" &&
    "action" in message &&
    typeof (message as { action?: { type?: unknown } }).action?.type === "string",
  );
}

function actionToRoundPlan(message: { action: { type: string } }): RoundPlan {
  const action = message.action;
  if (action.type === "pass") return PASS_PLAN;
  return PASS_PLAN;
}

function receivePlanFromChannel(channel: AgentChannel): Promise<RoundPlan> {
  if (channel.receivePlan) {
    return channel.receivePlan();
  }
  if (channel.onMessage) {
    return new Promise<RoundPlan>((resolve) => {
      channel.onMessage?.((message) => {
        if (isRoundPlanMessage(message)) {
          resolve(message.plan);
          return;
        }
        if (isLegacyActionMessage(message)) {
          resolve(actionToRoundPlan(message));
          return;
        }
        resolve(PASS_PLAN);
      });
    });
  }
  return Promise.resolve(PASS_PLAN);
}

function sendRoundFrame(
  channel: AgentChannel,
  state: MatchState,
  budget: AgentRoundBudget,
): void {
  if (channel.receivePlan) {
    channel.send({ state, budget });
    return;
  }
  channel.send(state as unknown as { state: MatchState; budget: AgentRoundBudget });
}

export class MatchRunner {
  constructor(private db: Database) {}

  async start(
    ctx: RunnerContext,
    channels: { a: AgentChannel; b: AgentChannel },
    turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
  ): Promise<RunnerResult> {
    const matchRecord: MatchRecord = {
      id: ctx.matchId,
      operatorAId: ctx.a.id,
      operatorBId: ctx.b.id,
      agentAId: 0,
      agentBId: 0,
      originTag: "ladder:pending",
      outcome: null,
      createdAt: Date.now(),
    };
    saveMatch(this.db, { ...matchRecord, originTag: "ladder" });

    let state: MatchState = createMatch(ctx.matchId, String(ctx.a.id), String(ctx.b.id));
    let budgetA: AgentRoundBudget = newBudget();
    let budgetB: AgentRoundBudget = newBudget();
    let round = 0;
    let seq = 0;

    let forfeitWinnerId: number | null = null;
    channels.a.onClose?.(() => {
      forfeitWinnerId = ctx.b.id;
    });
    channels.b.onClose?.(() => {
      forfeitWinnerId = ctx.a.id;
    });

    while (true) {
      if (channels.a.closed || channels.b.closed) {
        const winnerId = channels.a.closed ? ctx.b.id : ctx.a.id;
        return this.endForfeit(ctx.matchId, winnerId);
      }
      if (forfeitWinnerId !== null) {
        return this.endForfeit(ctx.matchId, forfeitWinnerId);
      }
      if (round >= ROUND_CAP) {
        return this.endTimeout(ctx.matchId, null);
      }

      const publicState: MatchState = { ...state, roundCap: ROUND_CAP };
      sendRoundFrame(channels.a, publicState, budgetA);
      sendRoundFrame(channels.b, publicState, budgetB);

      const [resA, resB] = await Promise.all([
        withTimeout(receivePlanFromChannel(channels.a), turnTimeoutMs),
        withTimeout(receivePlanFromChannel(channels.b), turnTimeoutMs),
      ]);

      if (!resA.ok || !resB.ok) {
        if (!resA.ok && !resB.ok) return this.endTimeout(ctx.matchId, null);
        if (!resA.ok) return this.endTimeout(ctx.matchId, ctx.b.id);
        return this.endTimeout(ctx.matchId, ctx.a.id);
      }

      const planA = resA.value;
      const planB = resB.value;

      const invalidA = validateRoundPlan(planA, "A", state, budgetA);
      if (!invalidA.ok) {
        return this.endInvalidPlan(ctx.matchId, ctx.b.id, "A", invalidA.reason);
      }
      const invalidB = validateRoundPlan(planB, "B", state, budgetB);
      if (!invalidB.ok) {
        return this.endInvalidPlan(ctx.matchId, ctx.a.id, "B", invalidB.reason);
      }

      const result = runRound({
        matchId: ctx.matchId, round, state,
        planA, planB, budgetA, budgetB,
      });
      state = result.nextState;
      budgetA = result.nextBudgetA;
      budgetB = result.nextBudgetB;

      for (const ev of result.events) {
        appendEvents(this.db, ctx.matchId, [{
          seq, eventType: ev.type,
          payload: JSON.stringify(ev.payload),
          ts: Date.now(),
        }]);
        seq++;
      }
      round++;

      if (result.ended) break;
    }

    return this.endByVictory(ctx.matchId, state, ctx.a.id, ctx.b.id);
  }

  private endForfeit(matchId: string, winnerId: number | null): RunnerResult {
    updateForfeit(this.db, matchId,
      JSON.stringify({ winnerOperatorId: winnerId, reason: "forfeit" }),
      "ladder");
    return { winnerOperatorId: winnerId, reason: "forfeit" };
  }

  private endTimeout(matchId: string, winnerId: number | null): RunnerResult {
    updateMatchOutcome(this.db, matchId,
      JSON.stringify({ winnerOperatorId: winnerId, reason: "timeout" }),
      winnerId, "ladder");
    return { winnerOperatorId: winnerId, reason: "timeout" };
  }

  private endInvalidPlan(matchId: string, winnerId: number, loser: "A" | "B", reason: string): RunnerResult {
    updateMatchOutcome(this.db, matchId,
      JSON.stringify({ winnerOperatorId: winnerId, reason: "invalid_plan", loser, detail: reason }),
      winnerId, "ladder");
    return { winnerOperatorId: winnerId, reason: "invalid_plan" };
  }

  private endByVictory(matchId: string, state: MatchState, aId: number, bId: number): RunnerResult {
    const victory = checkVictory(state);
    let winnerOperatorId: number | null = null;
    let reason: MatchConclusionReason = "timeout";
    if (victory.winner === "A") { winnerOperatorId = aId; reason = "decisive"; }
    else if (victory.winner === "B") { winnerOperatorId = bId; reason = "decisive"; }
    updateMatchOutcome(this.db, matchId,
      JSON.stringify({ winnerOperatorId, reason }),
      winnerOperatorId, "ladder");
    return { winnerOperatorId, reason };
  }
}
