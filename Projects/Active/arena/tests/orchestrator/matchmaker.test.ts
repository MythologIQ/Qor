import { describe, it, expect, beforeEach } from "bun:test";
import { queueAgent, findOpponent, launchMatch, getQueueStatus, resetMatchmakerState } from "../../src/orchestrator/matchmaker.ts";
import { createOperator } from "../../src/storage/operators.ts";
import { registerAgent } from "../../src/storage/agents.ts";
import { getDb } from "../../src/storage/db.ts";

describe("Matchmaker (Phase 2)", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM match_records");
    db.exec("DELETE FROM agent_versions");
    db.exec("DELETE FROM operators");
    resetMatchmakerState();
  });

  it("enqueues a single agent without creating a match", () => {
    const { operator } = createOperator("op-enqueue-single");
    const { agent } = registerAgent(operator.id, "SingleAgent", "fp-single", "qwen2.5-14b");

    queueAgent(agent.id, "vanguard");
    const opponent = findOpponent(agent.id, "vanguard");

    expect(opponent).toBeNull();
  });

  it("creates a match when two agents are enqueued in the same bracket", () => {
    const { operator: op1 } = createOperator("op-match-two-1");
    const { operator: op2 } = createOperator("op-match-two-2");
    const { agent: ag1 } = registerAgent(op1.id, "AgentA", "fp-a", "gpt-4o-mini");
    const { agent: ag2 } = registerAgent(op2.id, "AgentB", "fp-b", "qwen2.5-14b");

    queueAgent(ag1.id, "apex");
    queueAgent(ag2.id, "apex");

    const match = launchMatch(ag1.id, ag2.id, "apex");

    expect(match).toBeDefined();
    expect(match.id).toMatch(/^match-/);
    expect(match.agentAId).toBe(ag1.id);
    expect(match.agentBId).toBe(ag2.id);
  });

  it("creates a unique match ID for each match", () => {
    const { operator: op1 } = createOperator("op-unique-id-1");
    const { operator: op2 } = createOperator("op-unique-id-2");
    const { operator: op3 } = createOperator("op-unique-id-3");
    const { operator: op4 } = createOperator("op-unique-id-4");
    const { agent: ag1 } = registerAgent(op1.id, "UniqueA1", "fp-u1", "qwen2.5-14b");
    const { agent: ag2 } = registerAgent(op2.id, "UniqueA2", "fp-u2", "qwen2.5-7b");
    const { agent: ag3 } = registerAgent(op3.id, "UniqueA3", "fp-u3", "gpt-4o-mini");
    const { agent: ag4 } = registerAgent(op4.id, "UniqueA4", "fp-u4", "llama-70b");

    queueAgent(ag1.id, "sentinel");
    queueAgent(ag2.id, "sentinel");
    const match1 = launchMatch(ag1.id, ag2.id, "sentinel");

    queueAgent(ag3.id, "vanguard");
    queueAgent(ag4.id, "vanguard");
    const match2 = launchMatch(ag3.id, ag4.id, "vanguard");

    expect(match1.id).not.toBe(match2.id);
  });

  it("does not create more matches when fewer than 2 agents are pending", () => {
    const { operator } = createOperator("op-fewer-than-two");
    const { agent } = registerAgent(operator.id, "LoneAgent", "fp-lone", "qwen2.5-14b");

    queueAgent(agent.id, "vanguard");
    const opponent = findOpponent(agent.id, "vanguard");

    expect(opponent).toBeNull();
  });

  it("getQueueStatus returns the match state for all brackets", () => {
    const status = getQueueStatus();

    expect(status).toBeDefined();
    expect(status.length).toBeGreaterThan(0);
    expect(status[0].bracket).toBeDefined();
    expect(typeof status[0].queued).toBe("number");
  });
});