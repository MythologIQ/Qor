// HexaWars Agent Plan Contract (Plan D v2)
// Contract ID: hexawars-agent-contract-v2
// Transport: WebSocket, JSON frames

export const PROTOCOL_VERSION = '2.0';

export type { HexCell, Unit, RoundPlan, AgentRoundBudget } from '../shared/types';

// ─── Server → Client Frames ────────────────────────────────────────────────

export interface HelloFrame {
  type: 'HELLO';
  matchId: string;
  side: 'A' | 'B';
  seed: string;
  boardSize: { width: number; height: number };
  timeBudgetMs: number;
  protocolVersion: string;
}

export interface StateFrame {
  type: 'STATE';
  turn: number;
  visible: import('../shared/types').HexCell[];
  units: import('../shared/types').Unit[];
  score: { a: number; b: number };
  deadline: number;
  roundCap: number;
  budget: import('../shared/types').AgentRoundBudget;
}

export interface AckFrame {
  type: 'ACK';
  accepted: boolean;
  reason?: 'invalid_plan' | 'budget_exceeded' | 'extras_not_implemented';
}

export interface EventFrame {
  type: 'EVENT';
  event:
    | 'unit_moved'
    | 'unit_attacked'
    | 'unit_destroyed'
    | 'territory_claimed'
    | 'turn_ended'
    | 'action_retargeted'
    | 'slots_refunded';
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface EndFrame {
  type: 'END';
  matchId?: string;
  winner: 'A' | 'B' | 'draw' | null;
  reason: 'victory' | 'draw' | 'elimination' | 'territory_control' | 'round_cap' | 'timeout' | 'forfeit';
  metrics: {
    totalActions: number;
    avgDecisionMs: number;
    invalidActions: number;
    totalMs?: number;
  };
  finalScore?: { a: number; b: number };
}

// ─── Client → Server Frames ────────────────────────────────────────────────

export interface ReadyFrame {
  type: 'READY';
  agentId: string;
  agentVersion: string;
}

export interface PlanFrame {
  type: 'PLAN';
  plan: import('../shared/types').RoundPlan;
  confidence: number;
  metadata?: {
    reasoning?: string;
    [k: string]: unknown;
  };
}
