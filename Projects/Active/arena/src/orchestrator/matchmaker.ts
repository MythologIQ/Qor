// Match Facilitation Phase 2 — Matchmaker
// Bracket-aware in-memory pairing queue.

import { BRACKETS, type BracketName, getBracketConfig } from "./bracket.ts";
import { createMatch as createMatchRecord } from "../storage/matches.ts";
import { getAgentById, type AgentVersion } from "../storage/agents.ts";
import type { MatchRecord } from "../shared/types.ts";

// ─── Types ────────────────────────────────────────────────────────────────

interface QueuedAgent {
  agentId: number;
  bracket: BracketName;
  enqueuedAt: number;
}

interface ActiveRuntime {
  matchId: string;
  startedAt: number;
}

// ─── Module State ─────────────────────────────────────────────────────────

const queues = new Map<BracketName, QueuedAgent[]>();
for (const b of BRACKETS) queues.set(b.name, []);

const activeRuntimes = new Map<string, ActiveRuntime>();

/**
 * Reset in-memory matchmaker state.
 * Exported for test isolation — call in beforeEach when testing matchmaker.
 */
export function resetMatchmakerState(): void {
  for (const b of BRACKETS) queues.set(b.name, []);
  activeRuntimes.clear();
}

// ─── Queue Operations ────────────────────────────────────────────────────

/**
 * Enqueue an agent for a given bracket.
 * The agent is appended to the bracket-specific queue.
 */
export function queueAgent(agentId: number, bracket: string): void {
  const bracketName = validateBracket(bracket);
  const queue = queues.get(bracketName)!;
  // Avoid duplicate enqueue of the same agent in the same bracket
  if (!queue.some((q) => q.agentId === agentId)) {
    queue.push({ agentId, bracket: bracketName, enqueuedAt: Date.now() });
  }
}

/**
 * Find the first eligible opponent for `agentId` in the same bracket.
 * Excludes the enqueuing agent itself.
 * Returns the agent record or null if none available.
 */
export function findOpponent(agentId: number, bracket: string): AgentVersion | null {
  const bracketName = validateBracket(bracket);
  const queue = queues.get(bracketName)!;

  // Find first agent in queue that is not the requesting agent
  const entry = queue.find((q) => q.agentId !== agentId);
  if (!entry) return null;

  const agent = getAgentById(entry.agentId);
  if (!agent) return null;
  return agent;
}

/**
 * Remove an agent from its bracket queue.
 * Called after an opponent is found and the match is launched.
 */
function dequeue(agentId: number, bracket: BracketName): void {
  const queue = queues.get(bracket)!;
  const idx = queue.findIndex((q) => q.agentId === agentId);
  if (idx !== -1) queue.splice(idx, 1);
}

// ─── Match Launch ────────────────────────────────────────────────────────

/**
 * Launch a match between two agents.
 * Creates the match record, registers it in the active runtimes map.
 * Returns the created MatchRecord.
 */
export function launchMatch(
  agentAId: number,
  agentBId: number,
  bracket: string,
): MatchRecord {
  const bracketName = validateBracket(bracket);

  const agentA = getAgentById(agentAId);
  const agentB = getAgentById(agentBId);
  if (!agentA || !agentB) throw new Error("One or both agents not found");

  // Create DB match record
  const match = createMatchRecord(agentAId, agentBId, "auto");

  // Register in active runtimes
  activeRuntimes.set(match.id, {
    matchId: match.id,
    startedAt: Date.now(),
  });

  // Remove both agents from queue
  dequeue(agentAId, bracketName);
  dequeue(agentBId, bracketName);

  return match;
}

// ─── Status ───────────────────────────────────────────────────────────────

export interface QueueStatus {
  bracket: BracketName;
  queued: number;
}

/**
 * Return queue depth for all three brackets.
 */
export function getQueueStatus(): QueueStatus[] {
  return BRACKETS.map((b) => ({
    bracket: b.name,
    queued: queues.get(b.name)!.length,
  }));
}

// ─── Internal ─────────────────────────────────────────────────────────────

function validateBracket(bracket: string): BracketName {
  if ((BRACKETS as BracketDef[]).find((b) => b.name === bracket)) {
    return bracket as BracketName;
  }
  throw new Error(`Invalid bracket: ${bracket}`);
}

// Re-export bracket types for convenience
export type { BracketDef };