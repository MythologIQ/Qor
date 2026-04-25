import { describe, it, beforeEach, expect } from "bun:test";
import { queueAgent, findOpponent, launchMatch, resetMatchmakerState } from "../../src/orchestrator/matchmaker.ts";
import { createOperator } from "../../src/storage/operators.ts";
import { registerAgent } from "../../src/storage/agents.ts";
import { getDb } from "../../src/storage/db.ts";

describe("matchmaker (Phase 2)", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM match_records");
    db.exec("DELETE FROM agent_versions");
    db.exec("DELETE FROM operators");
    resetMatchmakerState();
  });

  it("1 enqueued → no opponent found", () => {
    const { operator } = createOperator("op-1-enqueue");
    const { agent } = registerAgent(operator.id, "AliceAgent", "fp-alice", "gpt-4o");

    queueAgent(agent.id, "apex");
    const opponent = findOpponent(agent.id, "apex");

    expect(opponent).toBeNull();
  });

  it("2 enqueued in same bracket → opponent found", () => {
    const { operator: op1 } = createOperator("op-2-enqueue-1");
    const { operator: op2 } = createOperator("op-2-enqueue-2");
    const { agent: ag1 } = registerAgent(op1.id, "BobAgent", "fp-bob", "qwen2.5-14b");
    const { agent: ag2 } = registerAgent(op2.id, "CarolAgent", "fp-carol", "llama-70b");

    queueAgent(ag1.id, "apex");
    queueAgent(ag2.id, "apex");

    const opponent = findOpponent(ag1.id, "apex");
    expect(opponent).not.toBeNull();
    expect(opponent!.id).toBe(ag2.id);
  });

  it("2 enqueued → match launched and agents dequeued", () => {
    const { operator: op1 } = createOperator("op-2-launch-1");
    const { operator: op2 } = createOperator("op-2-launch-2");
    const { agent: ag1 } = registerAgent(op1.id, "LaunchA", "fp-la", "qwen2.5-14b");
    const { agent: ag2 } = registerAgent(op2.id, "LaunchB", "fp-lb", "llama-70b");

    queueAgent(ag1.id, "apex");
    queueAgent(ag2.id, "apex");

    const match = launchMatch(ag1.id, ag2.id, "apex");

    expect(match.id).toBeDefined();
    expect(match.agentAId).toBe(ag1.id);
    expect(match.agentBId).toBe(ag2.id);

    // Both agents should be dequeued
    expect(findOpponent(ag1.id, "apex")).toBeNull();
    expect(findOpponent(ag2.id, "apex")).toBeNull();
  });

  it("3 enqueued → first pair found, remaining agent has no opponent", () => {
    const { operator: op1 } = createOperator("op-3-enqueue-1");
    const { operator: op2 } = createOperator("op-3-enqueue-2");
    const { operator: op3 } = createOperator("op-3-enqueue-3");
    const { agent: ag1 } = registerAgent(op1.id, "DaveAgent", "fp-dave", "qwen2.5-7b");
    const { agent: ag2 } = registerAgent(op2.id, "EveAgent", "fp-eve", "gpt-4o-mini");
    const { agent: ag3 } = registerAgent(op3.id, "FayAgent", "fp-fay", "llama-70b");

    queueAgent(ag1.id, "sentinel");
    queueAgent(ag2.id, "sentinel");
    queueAgent(ag3.id, "sentinel");

    // findOpponent doesn't dequeue — launchMatch does
    const first = findOpponent(ag1.id, "sentinel");
    expect(first).not.toBeNull();

    // Launch the match to actually dequeue both agents
    launchMatch(ag1.id, first!.id, "sentinel");

    // Now ag3 should find no opponent (ag1 and ag2 were matched and dequeued)
    const second = findOpponent(ag3.id, "sentinel");
    expect(second).toBeNull();
  });
});