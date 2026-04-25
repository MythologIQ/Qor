// Match Facilitation Phase 2 — Matchmaker Tests

import { describe, expect, test, beforeEach } from "bun:test";
import {
  queueAgent,
  findOpponent,
  launchMatch,
  getQueueStatus,
  resetMatchmakerState,
} from "./matchmaker.ts";
import { createOperator } from "../storage/operators.ts";
import { registerAgent } from "../storage/agents.ts";
import { getDb } from "../storage/db.ts";

// ─── Per-test isolation ────────────────────────────────────────────────────────
// Wipe module-level queue state between each test run to prevent cross-test
// queue pollution from shared in-memory module state.
beforeEach(() => {
  const db = getDb();
  // Clean tables to prevent handle/agent uniqueness conflicts across test runs
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec("DELETE FROM challenges");
  db.exec("DELETE FROM match_events");
  db.exec("DELETE FROM matches");
  db.exec("DELETE FROM match_records");
  db.exec("DELETE FROM agent_versions");
  db.exec("DELETE FROM operators");
  db.exec("PRAGMA foreign_keys=ON");
  // Also clear the in-memory matchmaker queues
  resetMatchmakerState();
});

test("queueAgent adds to correct bracket", async () => {
  const { operator: op1 } = createOperator("bracket-q-agent1");
  const { operator: op2 } = createOperator("bracket-q-agent2");
  const { agent: ag1 } = registerAgent(op1.id, "TestAgent-A", "qwen2.5-14b", "sentinel");
  const { agent: ag2 } = registerAgent(op2.id, "TestAgent-B", "gpt-4o", "vanguard");

  queueAgent(ag1.id, "vanguard");
  queueAgent(ag2.id, "vanguard");
  const status = getQueueStatus();
  const vanguard = status.find((s) => s.bracket === "vanguard");
  expect(vanguard?.queued).toBeGreaterThanOrEqual(2);
});

test("findOpponent excludes self", async () => {
  const { operator: op3 } = createOperator("bracket-q-agent3");
  const { agent: ag3 } = registerAgent(op3.id, "TestAgent-C", "llama-70b", "vanguard");

  queueAgent(ag3.id, "vanguard");

  const opponent = findOpponent(ag3.id, "vanguard");
  expect(opponent).toBeNull();
});

test("launchMatch creates MatchRecord and clears queue", async () => {
  const { operator: op4 } = createOperator("bracket-launch-op1");
  const { operator: op5 } = createOperator("bracket-launch-op2");
  const { agent: ag4 } = registerAgent(op4.id, "LaunchAgent-A", "qwen2.5-7b", "sentinel");
  const { agent: ag5 } = registerAgent(op5.id, "LaunchAgent-B", "gpt-4o-mini", "sentinel");
  queueAgent(ag4.id, "sentinel");
  queueAgent(ag5.id, "sentinel");
  const match = launchMatch(ag4.id, ag5.id, "sentinel");

  expect(match.id).toBeTruthy();
  expect(match.agent_a_id).toBe(ag4.id);
  expect(match.agent_b_id).toBe(ag5.id);

  const opponent = findOpponent(ag4.id, "sentinel");
  expect(opponent).toBeNull();
});

test("getQueueStatus returns all three brackets", () => {
  const status = getQueueStatus();
  expect(status).toHaveLength(3);
  expect(status.map((s) => s.bracket)).toContain("sentinel");
  expect(status.map((s) => s.bracket)).toContain("vanguard");
  expect(status.map((s) => s.bracket)).toContain("apex");
});

test("bracket auto-classification via model size", async () => {
  const { operator: op } = createOperator("bracket-classify-op");
  const { agent: ag_s7 } = registerAgent(op.id, "SentinelAgent", "qwen2.5-7b", "sentinel");
  const { agent: ag_v14 } = registerAgent(op.id, "VanguardAgent", "qwen2.5-14b", "vanguard");
  const { agent: ag_apex } = registerAgent(op.id, "ApexAgent", "claude-3-5-sonnet", "apex");

  queueAgent(ag_s7.id, "sentinel");
  queueAgent(ag_v14.id, "vanguard");
  queueAgent(ag_apex.id, "apex");

  const status = getQueueStatus();
  const sentinel = status.find((s) => s.bracket === "sentinel");
  const vanguard = status.find((s) => s.bracket === "vanguard");
  const apex = status.find((s) => s.bracket === "apex");

  expect(sentinel?.queued).toBeGreaterThanOrEqual(1);
  expect(vanguard?.queued).toBeGreaterThanOrEqual(1);
  expect(apex?.queued).toBeGreaterThanOrEqual(1);
});

test("creates a match when two agents are enqueued in the same bracket", async () => {
  const { operator: op1 } = createOperator("bracket-test-2a");
  const { operator: op2 } = createOperator("bracket-test-2b");
  const { agent: ag1 } = registerAgent(op1.id, "TestAgent-2A", "gpt-4o-mini", "apex");
  const { agent: ag2 } = registerAgent(op2.id, "TestAgent-2B", "qwen2.5-14b", "apex");

  queueAgent(ag1.id, "apex");
  queueAgent(ag2.id, "apex");

  const match = launchMatch(ag1.id, ag2.id, "apex");

  expect(match).toBeDefined();
  expect(match.id).toMatch(/^match-/);
  expect(match.agent_a_id).toBe(ag1.id);
  expect(match.agent_b_id).toBe(ag2.id);
});