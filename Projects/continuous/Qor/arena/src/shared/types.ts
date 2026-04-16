// HexaWars Agent Action Contract v1 — Shared Types
// FROZEN: Do not modify contract semantics.

export interface CubeCoord {
  q: number;
  r: number;
  s: number; // invariant: q + r + s = 0
}

export interface Unit {
  id: string;
  owner: "A" | "B";
  position: CubeCoord;
  strength: number; // 1–10
  hp: number; // 1–10
  type: "infantry" | "scout" | "heavy";
}

export interface HexCell {
  position: CubeCoord;
  terrain: "plain" | "forest" | "mountain" | "water";
  controlledBy?: "A" | "B";
  unit?: Unit;
}

export interface MatchState {
  turn: number;
  yourTurn: boolean;
  visible: HexCell[];
  units: Unit[];
  score: { a: number; b: number };
  deadline: number; // Unix ms
}

export type AgentActionType = "move" | "attack" | "pass";

export interface AgentAction {
  type: AgentActionType;
  from?: CubeCoord;
  to?: CubeCoord;
  confidence: number; // 0.0–1.0
  metadata?: Record<string, unknown>;
}

export type EngineEventType =
  | "unit_moved"
  | "unit_attacked"
  | "unit_destroyed"
  | "territory_claimed"
  | "turn_ended";

export interface EngineEvent {
  type: EngineEventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

export const BOARD_SIZE = 9;
export const TIME_BUDGET_MS = 5000;
export const TURN_CAP = 50;
export const STARTING_UNITS = 3;