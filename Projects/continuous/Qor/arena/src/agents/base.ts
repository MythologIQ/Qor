// Base Agent Interface
// HexaWars Agent Contract v1
// Agent tier: base

import type { AgentAction, MatchState } from '../shared/types';

export abstract class BaseAgent {
  readonly id: string;
  readonly version: string;

  constructor(id: string, version: string = '1.0') {
    this.id = id;
    this.version = version;
  }

  /**
   * decide is called when it is the agent's turn.
   * @param state Current match state (yourTurn is guaranteed true when called)
   * @returns AgentAction to send to the game server
   */
  abstract decide(state: MatchState): AgentAction | Promise<AgentAction>;

  /**
   * Optional lifecycle hook called when the agent receives game metadata.
   */
  onHello?(matchId: string, side: 'A' | 'B', seed: string): void;

  /**
   * Optional lifecycle hook called after each accepted action.
   */
  onAck?(accepted: boolean, reason?: string): void;

  /**
   * Optional lifecycle hook called on game end.
   */
  onEnd?(winner: 'A' | 'B' | 'draw', reason: string): void;
}