import type { OperatorRef } from "../shared/types.ts";

export interface RunnerContext {
  matchId: string;
  ladderId?: string;
  a: OperatorRef;
  b: OperatorRef;
}

export interface AgentChannel {
  send(msg: unknown): void;
  onMessage(cb: (m: unknown) => void): void;
  close(): void;
}

export type MatchConclusionReason = "decisive" | "timeout" | "forfeit";

export interface RunnerResult {
  winnerOperatorId: number | null;
  reason: MatchConclusionReason;
}