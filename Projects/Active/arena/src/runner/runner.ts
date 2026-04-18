import type { Database } from "bun:sqlite";
import type { MatchRecord, AgentAction, MatchState, MatchEvent } from "../shared/types.ts";
import { createMatch, stepMatch, computeMatchHash } from "../engine/match.ts";
import { saveMatch, appendEvents } from "../persistence/match-store.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "./types.ts";

/** Temporary match engine facade — replaces the full engine stub for turn dispatch. */
class TurnEngine {
  private _state: MatchState;
  private _actions: { a: AgentAction | null; b: AgentAction | null } = { a: null, b: null };
  private _done = false;

  constructor(seed: string, sideA: string, sideB: string) {
    this._state = createMatch(seed, sideA, sideB);
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
    if (result.ended || this._state.turn >= 50) {
      this._done = true;
    }
  }
}

export class MatchRunner {
  constructor(private db: Database) {}

  async start(
    ctx: RunnerContext,
    channels: { a: AgentChannel; b: AgentChannel },
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

    do {
      const isATurn = engine.state.yourTurn;
      const activeChannel = isATurn ? channels.a : channels.b;
      const waitingChannel = isATurn ? channels.b : channels.a;

      activeChannel.send(engine.publicState);

      const action = await new Promise<AgentAction>((resolve) => {
        if (typeof activeChannel.onMessage === "function") {
          activeChannel.onMessage((msg: unknown) => {
            resolve(((msg as any)?.action) ?? { type: "pass", confidence: 1 });
          });
        } else {
          resolve({ type: "pass", confidence: 1 });
        }
      });

      const otherAction = await new Promise<AgentAction>((resolve) => {
        if (typeof waitingChannel.onMessage === "function") {
          const timer = setTimeout(
            () => resolve({ type: "pass", confidence: 0 }),
            5000,
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
