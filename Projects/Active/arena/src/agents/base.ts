// Base Agent Interface — HexaWars Agent Contract (Plan D v2)
// Agents emit a RoundPlan per round given the current state + AP budget.

import type { MatchState, RoundPlan, AgentRoundBudget } from '../shared/types';

export abstract class BaseAgent {
  readonly id: string;
  readonly version: string;

  constructor(id: string, version: string = '1.0') {
    this.id = id;
    this.version = version;
  }

  /**
   * Called once per round. Return a RoundPlan the runner will submit.
   * Agents are expected to bid ≤ budget.apPool and leave extras as [].
   */
  abstract getRoundPlan(
    state: MatchState,
    budget: AgentRoundBudget,
  ): RoundPlan | Promise<RoundPlan>;

  decide(state: MatchState, budget: AgentRoundBudget = {
    freeMove: 1,
    freeAction: 1,
    apPool: 3,
    apCarry: 0,
  }): RoundPlan | Promise<RoundPlan> {
    return this.getRoundPlan(state, budget);
  }

  onHello?(matchId: string, side: 'A' | 'B', seed: string): void;
  onAck?(accepted: boolean, reason?: string): void;
  onEnd?(winner: 'A' | 'B' | 'draw' | null, reason: string): void;
}
