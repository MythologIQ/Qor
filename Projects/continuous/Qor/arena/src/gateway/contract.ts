// HexaWars Agent Action Contract v1
// Contract ID: hexawars-agent-contract-v1
// Transport: WebSocket, JSON frames

export const PROTOCOL_VERSION = '1.0';

// Re-export shared types used in frames
export type { HexCell, Unit } from '../shared/types';

// ─── Server → Client Frames ────────────────────────────────────────────────

export interface HelloFrame {
  type: 'HELLO';
  matchId: string;
  side: 'A' | 'B';
  seed: string;
  boardSize: { width: number; height: number };
  timeBudgetMs: number;
  turnCap: number;
  protocolVersion: string;
}

export interface StateFrame {
  type: 'STATE';
  turn: number;
  yourTurn: boolean;
  visible: import('../shared/types').HexCell[];
  units: import('../shared/types').Unit[];
  score: { a: number; b: number };
  deadline: number;
}

export interface AckFrame {
  type: 'ACK';
  accepted: boolean;
  reason?: 'invalid_action' | 'not_your_turn' | 'budget_exceeded' | 'out_of_range';
  correctedState?: Partial<import('../shared/types').GameState>;
}

export interface EventFrame {
  type: 'EVENT';
  event: 'unit_moved' | 'unit_attacked' | 'unit_destroyed' | 'territory_claimed' | 'turn_ended';
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface EndFrame {
  type: 'END';
  winner: 'A' | 'B' | 'draw';
  reason: 'elimination' | 'territory_control' | 'turn_cap' | 'timeout' | 'forfeit';
  finalScore: { a: number; b: number };
  metrics: {
    totalActions: number;
    avgDecisionMs: number;
    invalidActions: number;
  };
}

// ─── Client → Server Frames ────────────────────────────────────────────────

export interface ReadyFrame {
  type: 'READY';
  agentId: string;
  agentVersion: string;
}

export interface ActionFrame {
  type: 'ACTION';
  action: 'move' | 'attack' | 'pass';
  from?: { q: number; r: number; s: number };
  to?: { q: number; r: number; s: number };
  confidence: number;
  metadata?: {
    reasoning?: string;
    [k: string]: unknown;
  };
}
