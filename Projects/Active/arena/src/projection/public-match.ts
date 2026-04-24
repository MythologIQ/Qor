import type {
  PublicAgentSnapshot,
  PublicBoardCell,
  PublicBoardUnit,
  PublicFeedEntry,
  PublicMatchFrame,
  PublicMatchProjection,
  PublicOutcome,
  PublicReasoningEntry,
  PublicSidePanel,
} from "../shared/public-match.ts";
import type { MatchEvent, MatchRecord } from "../shared/types";

export interface PublicProjectionInput {
  matchId: string;
  mode: "live" | "demo" | "replay";
  round: number;
  roundCap: number;
  phase: string;
  pressure: number;
  headline: string;
  featuredEvent: string;
  board: PublicBoardCell[];
  units: PublicBoardUnit[];
  territories: { A: number; B: number };
  agents?: PublicAgentSnapshot[];
  reasoning?: PublicReasoningEntry[];
  feed?: PublicFeedEntry[];
  outcome?: PublicOutcome | null;
}

export interface LiveProjectionInput {
  match: MatchRecord;
  operatorA: string;
  operatorB: string;
  events: MatchEvent[];
}

const SHARE_DIFF_EVEN = 6;

function toPct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 10000) / 100;
}

function buildSidePanel(
  side: "A" | "B",
  territory: number,
  controlShare: number,
  agent?: PublicAgentSnapshot,
  reasoning: PublicReasoningEntry[] = [],
): PublicSidePanel {
  const fallbackOperator = side === "A" ? "Blue Horizon" : "Red Morrow";
  const label = agent?.operator?.replace(/^(Blue|Red)\s+/i, "") ?? fallbackOperator;
  return {
    side,
    operator: agent?.operator ?? fallbackOperator,
    label,
    modelId: agent?.modelId ?? "unknown",
    status: agent?.status ?? "idle",
    totalMs: agent?.totalMs ?? 0,
    totalActions: agent?.totalActions ?? 0,
    invalidCount: agent?.invalidCount ?? 0,
    controlShare,
    territory,
    reasoning,
  };
}

export function classifyMomentum(
  shareA: number,
  shareB: number,
): "blue" | "red" | "even" {
  const diff = shareA - shareB;
  if (Math.abs(diff) < SHARE_DIFF_EVEN) return "even";
  return diff > 0 ? "blue" : "red";
}

export function projectPublicMatch(
  input: PublicProjectionInput,
): PublicMatchProjection {
  const total = input.territories.A + input.territories.B;
  const shareA = toPct(input.territories.A, total);
  const shareB = toPct(input.territories.B, total);
  const agentsBySide = new Map(
    (input.agents ?? []).map((agent) => [agent.side, agent]),
  );
  const reasoningA = (input.reasoning ?? []).filter((entry) => entry.side === "A");
  const reasoningB = (input.reasoning ?? []).filter((entry) => entry.side === "B");

  return {
    matchId: input.matchId,
    mode: input.mode,
    phase: input.phase,
    round: input.round,
    roundCap: input.roundCap,
    pressure: input.pressure,
    board: {
      cells: input.board.slice(),
      units: input.units.slice(),
      territories: { ...input.territories },
      controlShare: { A: shareA, B: shareB },
      momentum: classifyMomentum(shareA, shareB),
    },
    sides: {
      A: buildSidePanel("A", input.territories.A, shareA, agentsBySide.get("A"), reasoningA),
      B: buildSidePanel("B", input.territories.B, shareB, agentsBySide.get("B"), reasoningB),
    },
    featured: {
      headline: input.headline,
      detail: input.featuredEvent,
    },
    feed: (input.feed ?? []).slice(),
    outcome: input.outcome ?? null,
  };
}

function toFeedKind(kind: string): PublicFeedEntry["kind"] {
  if (kind === "unit_attacked" || kind === "unit_destroyed") return "attack";
  if (kind === "territory_claimed") return "claim";
  if (kind === "unit_moved") return "move";
  return "system";
}

function toOutcome(raw: string | null): PublicOutcome | null {
  if (!raw) return null;
  if (raw.startsWith("A")) return { winner: "A", reason: raw };
  if (raw.startsWith("B")) return { winner: "B", reason: raw };
  return { winner: "draw", reason: raw };
}

export function projectLiveSpectatorMatch(
  input: LiveProjectionInput,
): PublicMatchProjection {
  const latest = input.events.at(-1);
  const feed = input.events.map((event) => ({
    round: event.seq,
    side: "neutral",
    kind: toFeedKind(event.eventType),
    headline: event.eventType.replaceAll("_", " "),
    detail: event.payload,
    timestamp: event.ts,
  })) satisfies PublicFeedEntry[];
  const round = latest?.seq ?? 0;
  const phase = input.match.outcome ? "Completed" : input.events.length > 0 ? "Live Feed" : "Awaiting Actions";
  const projection = projectPublicMatch({
    matchId: input.match.id,
    mode: "live",
    round,
    roundCap: 0,
    phase,
    pressure: 0,
    headline: latest ? `Latest ${latest.eventType.replaceAll("_", " ")}` : "Awaiting first public event.",
    featuredEvent: latest?.payload ?? "No public feed yet.",
    board: [],
    units: [],
    territories: { A: 0, B: 0 },
    agents: [
      {
        id: String(input.match.agentAId),
        side: "A",
        operator: input.operatorA,
        modelId: "unknown",
        status: input.match.outcome ? "complete" : "active",
        totalMs: 0,
        totalActions: 0,
        invalidCount: 0,
      },
      {
        id: String(input.match.agentBId),
        side: "B",
        operator: input.operatorB,
        modelId: "unknown",
        status: input.match.outcome ? "complete" : "active",
        totalMs: 0,
        totalActions: 0,
        invalidCount: 0,
      },
    ] satisfies PublicAgentSnapshot[],
    feed,
    outcome: toOutcome(input.match.outcome),
  });
  return projection;
}

export function buildSpectatorFrames(projection: PublicMatchProjection): PublicMatchFrame[] {
  const base = {
    mode: projection.mode,
    matchId: projection.matchId,
  } as const;
  const frames: PublicMatchFrame[] = [
    { type: "MATCH_HELLO", ...base, projection },
    { type: "MATCH_STATE", ...base, projection },
  ];

  for (const event of projection.feed) {
    frames.push({ type: "MATCH_EVENT", ...base, event, projection });
  }

  if (projection.outcome) {
    frames.push({ type: "MATCH_END", ...base, outcome: projection.outcome, projection });
  }

  return frames;
}
