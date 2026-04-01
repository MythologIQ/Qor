import { describe, it, expect } from "bun:test";
import {
  deriveAutonomy,
  handleEmptyQueue,
  AutonomyLevel,
  type AgentContext,
  type HeartbeatResult,
} from "../src/heartbeat/mod";

describe("heartbeat autonomy derivation", () => {
  // F1: tier=2, mode=execute, cadence=30m, empty queue → AUTO_DERIVED
  it("F1: should auto-derive tasks when tier=2, mode=execute, cadence=30m, queue empty", async () => {
    const ctx: AgentContext = {
      tier: 2,
      mode: "execute",
      cadence: 30,
      phase: { objective: "Memory Operator Surface and Ergonomic API", name: "memory-phase" },
      progress: { completed: 142, total: 156 },
      blockers: ["Governance blocker", "No eligible Victor work"]
    };

    const result: HeartbeatResult = await handleEmptyQueue(ctx);
    
    expect(result.status).toBe("AUTO_DERIVED");
    expect(result.tasks).toBeDefined();
    expect(result.tasks!.length).toBeGreaterThan(0);
    expect(result.provenanceHash).toBeDefined();
  });

  // F2: tier=2, mode=execute, cadence=30m, derivation fails → QUARANTINE
  it("F2: should enter quarantine when derivation fails", async () => {
    const ctx: AgentContext = {
      tier: 2,
      mode: "execute",
      cadence: 30,
      phase: { objective: "", name: "empty-phase" }, // Empty objective will fail
      progress: { completed: 0, total: 0 },
      blockers: []
    };

    const result: HeartbeatResult = await handleEmptyQueue(ctx);
    
    expect(result.status).toBe("QUARANTINE");
  });

  // F3: tier=1, any mode, empty queue → USER_PROMPT (preserve existing)
  it("F3: should prompt user when tier=1 regardless of other factors", async () => {
    const ctx: AgentContext = {
      tier: 1,
      mode: "execute",
      cadence: 30,
      phase: { objective: "Should not derive", name: "test" },
      progress: { completed: 0, total: 0 },
      blockers: []
    };

    const result: HeartbeatResult = await handleEmptyQueue(ctx);
    
    expect(result.status).toBe("USER_PROMPT");
  });
});

describe("deriveAutonomy function", () => {
  it("should return FULL for tier=2 + execute + cadence >= 10", () => {
    const ctx: AgentContext = {
      tier: 2,
      mode: "execute",
      cadence: 30,
      phase: { objective: "test", name: "test" },
      progress: { completed: 0, total: 0 },
      blockers: []
    };

    const autonomy = deriveAutonomy(ctx);
    expect(autonomy).toBe(AutonomyLevel.FULL);
  });

  it("should return SUGGEST for tier=1", () => {
    const ctx: AgentContext = {
      tier: 1,
      mode: "execute",
      cadence: 30,
      phase: { objective: "test", name: "test" },
      progress: { completed: 0, total: 0 },
      blockers: []
    };

    const autonomy = deriveAutonomy(ctx);
    expect(autonomy).toBe(AutonomyLevel.SUGGEST);
  });
});
