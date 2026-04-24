import type { MatchState } from "../../../src/shared/types.ts";
import { createMatch } from "../../../src/engine/match.ts";

interface QueuedAgent {
  agentId: string;
  queuedAt: number;
}

interface MatchNotification {
  type: "match_created";
  matchId: string;
  agentA: string;
  agentB: string;
  matchState: MatchState;
}

const pendingAgents: QueuedAgent[] = [];
const matches = new Map<string, MatchState>();
let matchCounter = 0;

export function enqueue(agentId: string): void {
  if (!pendingAgents.some((agent) => agent.agentId === agentId)) {
    pendingAgents.push({ agentId, queuedAt: Date.now() });
  }
}

export function start(): MatchNotification | null {
  if (pendingAgents.length < 2) return null;
  const agentA = pendingAgents.shift()!;
  const agentB = pendingAgents.shift()!;
  matchCounter += 1;
  const matchId = `match-${matchCounter.toString().padStart(4, "0")}`;
  const matchState = createMatch(`seed-${matchId}-${Date.now()}`, agentA.agentId, agentB.agentId);
  matches.set(matchId, matchState);
  return { type: "match_created", matchId, agentA: agentA.agentId, agentB: agentB.agentId, matchState };
}

export function getMatch(matchId: string): MatchState | undefined {
  return matches.get(matchId);
}

export function clear(): void {
  pendingAgents.length = 0;
  matches.clear();
  matchCounter = 0;
}
