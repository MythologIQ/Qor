// HexaWars Agent Action Contract v1 — Shared Types
// FROZEN: Do not modify contract semantics.

export interface CubeCoord {
  q: number;
  r: number;
  s: number; // invariant: q + r + s = 0
}

export type UnitWeight = 1 | 2 | 3; // 1=light (scout), 2=medium (infantry), 3=heavy

export interface Unit {
  id: string;
  owner: "A" | "B";
  position: CubeCoord;
  strength: number; // 1–10
  hp: number; // 1–10
  type: "infantry" | "scout" | "heavy";
  weight?: UnitWeight;
}

export interface HexCell {
  position: CubeCoord;
  terrain: "plain" | "forest" | "mountain" | "water";
  controlledBy?: "A" | "B";
  unit?: Unit;
}

export interface MatchState {
  turn: number;
  visible: HexCell[];
  units: Unit[];
  score: { a: number; b: number };
  deadline: number; // Unix ms
  roundCap: number;
  /** Plan D Phase 4: active stances, keyed by appliesOnRound */
  stances?: StanceRecord[];
  /** Plan D Phase 4: active reserves */
  reserves?: ReserveRecord[];
}

export type EngineEventType =
  | "unit_moved"
  | "unit_attacked"
  | "unit_destroyed"
  | "territory_claimed"
  | "turn_ended"
  | "action_retargeted"
  | "slots_refunded"
  // Plan D Phase 4 AP extras:
  | "boost_applied"
  | "action_wasted"
  | "stance_recorded"
  | "reserve_recorded"
  // Plan D Phase 4 abilities:
  | "ability_resolved"
  | "unit_revealed"
  // Plan D Phase 5 reserve triggers:
  | "reserve_fired"
  | "wasted_action";

export interface EngineEvent {
  type: EngineEventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

export const BOARD_SIZE = 9;
export const TIME_BUDGET_MS = 5000;
export const STARTING_UNITS = 3;

// Plan D v2 Phase 1: Round Economy substrate (additive; AgentAction + TURN_CAP
// remain in place until Phase 3 cutover removes them).
export interface AgentRoundBudget {
  freeMove: number;
  freeAction: number;
  apPool: number;
  apCarry: number;
}

export type ExtraKind =
  | "boosted_ability"
  | "second_attack"
  | "defensive_stance"
  | "reserve_overwatch";

export interface FreeMovePlan {
  unitId: string;
  from: CubeCoord;
  to: CubeCoord;
  path?: CubeCoord[];
}

export interface FreeActionPlan {
  unitId: string;
  type: "attack" | "ability";
  from: CubeCoord;
  to: CubeCoord;
  abilityId?: string;
}

export interface ExtraEntry {
  kind: ExtraKind;
  unitId: string;
  to?: CubeCoord;
  mode?: "range" | "damage";
}

export interface RoundPlan {
  bid: number;
  freeMove?: FreeMovePlan;
  freeAction?: FreeActionPlan;
  extras: ExtraEntry[];
}

export interface BidRecord {
  round: number;
  bidA: number;
  bidB: number;
  winner: "A" | "B";
}

export interface StanceRecord {
  unitId: string;
  appliesOnRound: number;
}

export interface ReserveRecord {
  unitId: string;
  ownerId: "A" | "B";
  appliesOnRound: number;
  fired: boolean;
}

export interface RetargetEvent {
  type: "action_retargeted";
  agent: "A" | "B";
  attackerUnitId: string;
  originalTarget: CubeCoord;
  actualTarget: CubeCoord;
  actualTargetUnitId: string;
  damage: number;
  reason: "rushed_shot";
}

export interface BidResolverInput {
  matchId: string;
  round: number;
  agentA: { bid: number; plan: RoundPlan };
  agentB: { bid: number; plan: RoundPlan };
}

export interface ResolvedBidOrder {
  round: number;
  first: "A" | "B";
  bidA: number;
  bidB: number;
  tieBroken: boolean;
}

export interface RunRoundInput {
  matchId: string;
  round: number;
  state: MatchState;
  planA: RoundPlan;
  planB: RoundPlan;
  budgetA: AgentRoundBudget;
  budgetB: AgentRoundBudget;
}

export interface RunRoundResult {
  events: EngineEvent[];
  nextState: MatchState;
  nextBudgetA: AgentRoundBudget;
  nextBudgetB: AgentRoundBudget;
  ended: boolean;
}

// Identity Substrate (Plan A v2, Phase 1): storage-shape types.
export type Fingerprint = string & { readonly __brand: "Fingerprint" };
export interface Operator {
  id: number; handle: string; handleNormalized: string;
  tokenId: string; createdAt: number;
}
export interface AgentVersion {
  id: number; operatorId: number; fingerprint: Fingerprint;
  modelId: string; similarityFlagsJson: string | null; createdAt: number;
}
export interface MatchRecord {
  id: string; operatorAId: number; operatorBId: number;
  agentAId: number; agentBId: number; originTag: string;
  outcome: string | null; createdAt: number;
}
export interface MatchEvent {
  matchId: string; seq: number; eventType: string;
  payload: string; ts: number;
}
