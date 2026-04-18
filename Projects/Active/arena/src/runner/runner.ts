import type { Database } from "bun:sqlite";
import type { MatchRecord } from "../shared/types.ts";
import { createMatch } from "../engine/match.ts";
import { saveMatch } from "../persistence/match-store.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "./types.ts";

/**
 * MatchRunner — skeleton for ladder match execution.
 * Actual run loop (turn dispatch, agent interaction, conclusion) implemented in later ticks.
 */
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

    // Persist placeholder record; events appended by later tick loop
    saveMatch(this.db, matchRecord);

    return { winnerOperatorId: null, reason: "timeout" };
  }
}
