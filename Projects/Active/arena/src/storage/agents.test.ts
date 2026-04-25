import { describe, test, expect, beforeEach } from "bun:test";
import { initSchema, resetDb } from "./db";
import { registerOperator } from "./operators";
import {
  registerAgent,
  getAgentsByOperator,
  getAgentById,
  computeFingerprint,
  updateAgentVerification,
  setQueueEligible,
  getQueueEligibleAgents,
  type Bracket,
} from "./agents";

describe("agents storage", () => {
  let operatorId: number;

  beforeEach(() => {
    process.env.ARENA_DB = ":memory:";
    resetDb();
    initSchema();
    const op = registerOperator("AgentTestOp");
    operatorId = op.operator.id;
  });

  test("registerAgent returns valid shape", () => {
    const result = registerAgent(operatorId, "TestBot", "minimax/m2.7", "scout_force", {});
    expect(result.agent.name).toBe("TestBot");
    expect(result.agent.model_id).toBe("minimax/m2.7");
    expect(result.agent.bracket).toBe("scout_force");
    expect(result.agent.verification).toBe("unverified");
    expect(result.apiKey).toMatch(/^ag_[0-9a-f]{48}$/);
  });

  test("fingerprint is deterministic", () => {
    const fp1 = computeFingerprint({ modelId: "minimax/m2.7", systemPrompt: "be aggressive" });
    const fp2 = computeFingerprint({ modelId: "minimax/m2.7", systemPrompt: "be aggressive" });
    expect(fp1).toBe(fp2);
  });

  test("different config produces different fingerprint", () => {
    const fp1 = computeFingerprint({ modelId: "minimax/m2.7" });
    const fp2 = computeFingerprint({ modelId: "gpt-4o" });
    expect(fp1).not.toBe(fp2);
  });

  test("getAgentsByOperator returns list", () => {
    registerAgent(operatorId, "Bot1", "minimax/m2.7", "scout_force", {});
    registerAgent(operatorId, "Bot2", "minimax/m2.7", "warband", {});
    const agents = getAgentsByOperator(operatorId);
    expect(agents.length).toBe(2);
    const names = agents.map(a => a.name);
    expect(names).toContain("Bot1");
    expect(names).toContain("Bot2");
  });

  test("getAgentById returns agent", () => {
    const result = registerAgent(operatorId, "ByIdBot", "minimax/m2.7", "scout_force", {});
    const agent = getAgentById(result.agent.id);
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe("ByIdBot");
  });

  test("updateAgentVerification transitions correctly", () => {
    const result = registerAgent(operatorId, "VerifyBot", "minimax/m2.7", "scout_force", {});
    updateAgentVerification(result.agent.id, "pending_handshake");
    const agent = getAgentById(result.agent.id);
    expect(agent!.verification).toBe("pending_handshake");
  });

  test("setQueueEligible and getQueueEligibleAgents", () => {
    const result = registerAgent(operatorId, "QueueBot", "minimax/m2.7", "scout_force", {});
    updateAgentVerification(result.agent.id, "queue_eligible");
    setQueueEligible(result.agent.id, true);
    const eligible = getQueueEligibleAgents("scout_force");
    expect(eligible.length).toBe(1);
    expect(eligible[0].name).toBe("QueueBot");
  });

  test("bracket isolation in getQueueEligibleAgents", () => {
    const result = registerAgent(operatorId, "BracketBot", "minimax/m2.7", "warband", {});
    updateAgentVerification(result.agent.id, "queue_eligible");
    setQueueEligible(result.agent.id, true);
    const eligible = getQueueEligibleAgents("scout_force" as Bracket);
    expect(eligible.length).toBe(0);
  });
});
