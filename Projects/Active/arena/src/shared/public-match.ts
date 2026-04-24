export interface PublicBoardCell {
  q: number;
  r: number;
  s: number;
  terrain: string;
  controlledBy: "A" | "B" | null;
}

export interface PublicBoardUnit {
  id: string;
  side: "A" | "B";
  q: number;
  r: number;
  s: number;
  hp: number;
  strength: number;
  type: string;
  facing?: string;
}

export interface PublicReasoningEntry {
  agentId: string;
  side: "A" | "B";
  text: string;
}

export interface PublicAgentSnapshot {
  id: string;
  side: "A" | "B";
  operator: string;
  modelId: string;
  status: string;
  totalMs: number;
  totalActions: number;
  invalidCount: number;
}

export interface PublicFeedEntry {
  round: number;
  side: "A" | "B" | "neutral";
  kind: "move" | "attack" | "claim" | "system";
  headline: string;
  detail: string;
  timestamp?: number;
}

export interface PublicOutcome {
  winner: "A" | "B" | "draw";
  reason: string;
}

export interface PublicMatchHelloFrame {
  type: "MATCH_HELLO";
  mode: "live" | "demo" | "replay";
  matchId: string;
  projection: PublicMatchProjection;
}

export interface PublicMatchStateFrame {
  type: "MATCH_STATE";
  mode: "live" | "demo" | "replay";
  matchId: string;
  projection: PublicMatchProjection;
}

export interface PublicMatchEventFrame {
  type: "MATCH_EVENT";
  mode: "live" | "demo" | "replay";
  matchId: string;
  event: PublicFeedEntry;
  projection: PublicMatchProjection;
}

export interface PublicMatchEndFrame {
  type: "MATCH_END";
  mode: "live" | "demo" | "replay";
  matchId: string;
  outcome: PublicOutcome;
  projection: PublicMatchProjection;
}

export type PublicMatchFrame =
  | PublicMatchHelloFrame
  | PublicMatchStateFrame
  | PublicMatchEventFrame
  | PublicMatchEndFrame;

export interface PublicSidePanel {
  side: "A" | "B";
  operator: string;
  label: string;
  modelId: string;
  status: string;
  totalMs: number;
  totalActions: number;
  invalidCount: number;
  controlShare: number;
  territory: number;
  reasoning: PublicReasoningEntry[];
}

export interface PublicMatchProjection {
  matchId: string;
  mode: "live" | "demo" | "replay";
  phase: string;
  round: number;
  roundCap: number;
  pressure: number;
  board: {
    cells: PublicBoardCell[];
    units: PublicBoardUnit[];
    territories: { A: number; B: number };
    controlShare: { A: number; B: number };
    momentum: "blue" | "red" | "even";
  };
  sides: {
    A: PublicSidePanel;
    B: PublicSidePanel;
  };
  featured: {
    headline: string;
    detail: string;
  };
  feed: PublicFeedEntry[];
  outcome: PublicOutcome | null;
}

export interface PublicMatchSummary {
  matchId: string;
  mode: "live" | "demo" | "replay";
  round: number;
  roundCap: number;
  phase: string;
  pressure: number;
  operatorA: string;
  operatorB: string;
  territoryA: number;
  territoryB: number;
  momentum: "blue" | "red" | "even";
  outcome: PublicOutcome | null;
}

export interface PublicReplayCard {
  matchId: string;
  title: string;
  subtitle: string;
  pressure: number;
  momentum: "blue" | "red" | "even";
  winner: "A" | "B" | "draw" | null;
  reason: string | null;
}
