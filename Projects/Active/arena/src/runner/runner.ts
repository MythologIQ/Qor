import type { Database } from "bun:sqlite";
import type { MatchRecord, AgentAction, MatchState, MatchEvent } from "../shared/types.ts";
import { createMatch, stepMatch, computeMatchHash } from "../engine/match.ts";
import { saveMatch, appendEvents } from "../persistence/match-store.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "./types.ts";

const DEFAULT_TURN_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject("TIMEOUT"), ms)),
  ]).catch((err) => {
    if (err === "TIMEOUT") return onTimeout();
    throw err;
  }) as Promise<T>;
}

/** Temporary match engine facade — replaces the full engine stub for turn dispatch. */
class TurnEngine {
  private _state: MatchState;
  private _actions: { a: AgentAction | null; b: AgentAction | null } = { a: null, b: null };
  private _done = false;
  private _maxTurns: number;

  constructor(seed: string, sideA: string, sideB: string, maxTurns = 50) {
    this._state = createMatch(seed, sideA, sideB);
    this._maxTurns = maxTurns;
  }

  get state(): MatchState {
    return this._state;
  }

  get publicState(): MatchState {
    return this._state;
  }

  setActions(a: AgentAction, b: AgentAction): void {
    this._actions = { a, b };
  }

  get done(): boolean {
    return this._done;
  }

  tick(): void {
    if (this._done) return;
    const result = stepMatch(this._state, this._actions.a!, this._actions.b!);
    this._state = result.state;
    this._actions = { a: null, b: null };
    if (result.ended || this._state.turn >= this._maxTurns) {
      this._done = true;
    }
  }
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

    saveMatch(this.db, matchRecord);

    const engine = new TurnEngine(ctx.matchId, String(ctx.a.id), String(ctx.b.id));
    let seq = 0;

    // Forfeit guard: if either channel closes mid-match, the other player wins by forfeit
    let forfeitResult: RunnerResult | null = null;
    const timedOutOperatorId = (timedOutSide: "A" | "B"): number | null =>
      timedOutSide === "A" ? ctx.b.id : ctx.a.id;

    // Attach close listeners before match loop begins
    channels.a.onClose?.(() => {
      forfeitResult = { winnerOperatorId: ctx.b.id, reason: "forfeit" };
      const updated: MatchRecord = { ...matchRecord, outcome: "forfeit", originTag: "ladder:forfeit" };
      saveMatch(this.db, updated);
    });
    channels.b.onClose?.(() => {
      forfeitResult = { winnerOperatorId: ctx.a.id, reason: "forfeit" };
      const updated: MatchRecord = { ...matchRecord, outcome: "forfeit", originTag: "ladder:forfeit" };
      saveMatch(this.db, updated);
    });

    do {
      // Check if a channel closed mid-match (forfeit)
      if (forfeitResult) return forfeitResult;

      const isATurn = engine.state.yourTurn;
      const activeChannel = isATurn ? channels.a : channels.b;
      const waitingChannel = isATurn ? channels.b : channels.a;
      const activeSide: "A" | "B" = isATurn ? "A" : "B";

      activeChannel.send(engine.publicState);

      let action: AgentAction;
      let timedOut = false;

      try {
        action = await withTimeout(
          new Promise<AgentAction>((resolve) => {
            if (typeof activeChannel.onMessage === "function") {
              activeChannel.onMessage((msg: unknown) => {
                resolve(((msg as any)?.action) ?? { type: "pass", confidence: 1 });
              });
            } else {
              resolve({ type: "pass", confidence: 1 });
            }
          }),
          turnTimeoutMs,
          () => {
            timedOut = true;
            return { type: "pass", confidence: 0 };
          },
        );
      } catch {
        timedOut = true;
        action = { type: "pass", confidence: 0 };
      }

      if (timedOut) {
        const winnerOpId = timedOutOperatorId(activeSide);
        return { winnerOperatorId: winnerOpId, reason: "timeout" };
      }

      const otherAction: AgentAction = await new Promise<AgentAction>((resolve) => {
        if (typeof waitingChannel.onMessage === "function") {
          const timer = setTimeout(
            () => resolve({ type: "pass", confidence: 0 }),
            turnTimeoutMs,
          );
          waitingChannel.onMessage((msg: unknown) => {
            clearTimeout(timer);
            resolve(((msg as any)?.action) ?? { type: "pass", confidence: 1 });
          });
        } else {
          resolve({ type: "pass", confidence: 1 });
        }
      });

      engine.setActions(isATurn ? action : otherAction, isATurn ? otherAction : action);
      engine.tick();

      // Persist turn event immediately — small batch (one turn at a time)
      const turnEvent: Omit<MatchEvent, "matchId"> = {
        seq,
        eventType: "turn_action",
        payload: JSON.stringify({ turn: engine.state.turn, actionA: action, actionB: otherAction }),
        ts: Date.now(),
      };
      appendEvents(this.db, ctx.matchId, [turnEvent]);
      seq++;
    } while (!engine.done);

    const finalState = engine.state;
    const { checkVictory } = require("../engine/victory.ts");
    const victory = checkVictory(finalState);

    let reason: MatchConclusionReason = "timeout";
    let winnerOperatorId: number | null = null;

    if (victory.winner === "A") {
      winnerOperatorId = ctx.a.id;
      reason = "decisive";
    } else if (victory.winner === "B") {
      winnerOperatorId = ctx.b.id;
      reason = "decisive";
    } else {
      winnerOperatorId = null;
      reason = "timeout";
    }

    return { winnerOperatorId, reason };
  }
}

type MatchConclusionReason = "decisive" | "timeout" | "forfeit";
