import { describe, it, beforeEach, expect } from "bun:test";
import { registerAgent, getAgentById, getAgentsByOperator, computeFingerprint } from "./agents";
import { createOperator } from "./operators";
import { getDb } from "./db";

describe("agents storage", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM agent_versions");
    db.exec("DELETE FROM operators");
  });

  it("registerAgent returns valid shape", () => {
    const { operator } = createOperator("AgentTest");
    const { agent, apiKey } = registerAgent(operator.id, "MyAgent", "fingerprint123", "gpt-4");
    expect(agent.id).toBeGreaterThan(0);
    expect(agent.operatorId).toBe(operator.id);
    expect(agent.name).toBe("MyAgent");
    expect(agent.fingerprint).toBe("fingerprint123");
    expect(agent.modelId).toBe("gpt-4");
    expect(agent.bracket).toBe("scout_force");
    expect(agent.verification).toBe("unverified");
    expect(agent.queueEligible).toBe(false);
    expect(apiKey).toHaveLength(32);
  });

  it("getAgentById works", () => {
    const { operator } = createOperator("GetByIdTest");
    const { agent } = registerAgent(operator.id, "FindMe", "fp456", "claude-3");
    const found = getAgentById(agent.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(agent.id);
    expect(found!.name).toBe("FindMe");
  });

  it("getAgentsByOperator returns list", () => {
    const { operator } = createOperator("ListTest");
    registerAgent(operator.id, "Agent1", "fp1", "m1");
    registerAgent(operator.id, "Agent2", "fp2", "m2");
    const agents = getAgentsByOperator(operator.id);
    expect(agents.length).toBe(2);
  });

  it("fingerprint computation is deterministic", () => {
    const fp1 = computeFingerprint("gpt-4", "handle");
    const fp2 = computeFingerprint("gpt-4", "handle");
    expect(fp1).toBe(fp2);
    const fp3 = computeFingerprint("gpt-4", "other");
    expect(fp3).not.toBe(fp1);
  });
});