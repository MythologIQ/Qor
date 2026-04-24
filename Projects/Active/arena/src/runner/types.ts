import type { MatchState, AgentRoundBudget, RoundPlan } from "../shared/types.ts";

export interface OperatorRef {
  id: number;
  name?: string;
  handle?: string;
  operator?: string;
}

export interface RunnerContext {
  matchId: string;
  ladderId?: string;
  a: OperatorRef;
  b: OperatorRef;
}

export interface RoundFrame {
  state: MatchState;
  budget: AgentRoundBudget;
}

export interface AgentChannel {
  send(frame: RoundFrame): void;
  receivePlan?(): Promise<RoundPlan>;
  onMessage?(cb: (message: unknown) => void): void;
  close?(): void;
  dispose?(): void;
  onClose?(cb: () => void): void;
  operatorId?: number;
  /** Set by close() so the runner can poll for early forfeit before each round. */
  closed?: boolean;
}

export type MatchConclusionReason = "decisive" | "timeout" | "forfeit" | "invalid_plan";

export interface RunnerResult {
  winnerOperatorId: number | null;
  reason: MatchConclusionReason;
}
