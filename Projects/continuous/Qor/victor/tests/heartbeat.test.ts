import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import {
  deriveAutonomy,
  deriveTasksFromContext,
  handleEmptyQueue,
  inferLifecycleStage,
  forgeTaskToTask,
  AutonomyLevel,
  type AgentContext,
  type HeartbeatResult,
  type PhaseContext,
} from "../src/heartbeat/mod";

const FORGE_TMP = "/tmp/forge-heartbeat-test";
const FORGE_PHASES = `${FORGE_TMP}/phases.json`;

function writeForgePhases(phases: unknown[]) {
  mkdirSync(FORGE_TMP, { recursive: true });
  writeFileSync(FORGE_PHASES, JSON.stringify({ phases }));
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    tier: 2,
    mode: "execute",
    cadence: 30,
    phase: { objective: "Test objective", name: "test-phase", status: "active" },
    progress: { completed: 0, total: 10 },
    blockers: [],
    ...overrides,
  };
}

function makePhase(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    objective: "Test objective",
    name: "test-phase",
    status: "active",
    ...overrides,
  };
}

describe("inferLifecycleStage", () => {
  it("returns needs_plan when no plan exists", () => {
    expect(inferLifecycleStage(makePhase({ hasPlan: false }))).toBe("needs_plan");
  });

  it("returns needs_audit when plan exists but no audit", () => {
    expect(inferLifecycleStage(makePhase({ hasPlan: true, hasAudit: false }))).toBe("needs_audit");
  });

  it("returns needs_implement when audit exists but no implementation", () => {
    expect(inferLifecycleStage(makePhase({ hasPlan: true, hasAudit: true, hasImplementation: false }))).toBe("needs_implement");
  });

  it("returns needs_substantiate when implemented but not sealed", () => {
    expect(inferLifecycleStage(makePhase({
      hasPlan: true, hasAudit: true, hasImplementation: true, hasSeal: false,
    }))).toBe("needs_substantiate");
  });

  it("returns complete when all stages done", () => {
    expect(inferLifecycleStage(makePhase({
      hasPlan: true, hasAudit: true, hasImplementation: true, hasSeal: true,
    }))).toBe("complete");
  });

  it("returns needs_debug when lastError is set", () => {
    expect(inferLifecycleStage(makePhase({ lastError: "test failed" }))).toBe("needs_debug");
  });

  it("respects explicit lifecycle override", () => {
    expect(inferLifecycleStage(makePhase({ lifecycle: "needs_audit" }))).toBe("needs_audit");
  });
});

describe("deriveTasksFromContext — lifecycle", () => {
  it("derives a plan task for needs_plan stage", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].source).toBe("lifecycle:plan");
    expect(result.tasks[0].title).toContain("Create plan");
  });

  it("derives an audit task for needs_audit stage", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: true, hasAudit: false }),
    }));
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].source).toBe("lifecycle:audit");
  });

  it("derives an implement task for needs_implement stage", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: true, hasAudit: true, hasImplementation: false }),
    }));
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].source).toBe("lifecycle:implement");
  });

  it("derives a substantiate task for needs_substantiate stage", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: true, hasAudit: true, hasImplementation: true, hasSeal: false }),
    }));
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].source).toBe("lifecycle:substantiate");
  });

  it("derives a debug task when lastError is set", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ lastError: "Neo4j connection failed" }),
    }));
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].source).toBe("lifecycle:debug");
    expect(result.tasks[0].description).toContain("Neo4j connection failed");
  });

  it("derives no lifecycle task when complete", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: true, hasAudit: true, hasImplementation: true, hasSeal: true }),
    }));
    expect(result.tasks.length).toBe(0);
  });

  it("adds blocker task alongside lifecycle task", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: false }),
      blockers: ["Neo4j down"],
    }));
    expect(result.tasks.length).toBe(2);
    expect(result.tasks[0].source).toBe("lifecycle:plan");
    expect(result.tasks[1].source).toBe("blockers");
  });

  it("returns high confidence when tasks derived", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.confidence).toBe(0.9);
  });

  it("returns zero confidence when no tasks", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      phase: makePhase({ hasPlan: true, hasAudit: true, hasImplementation: true, hasSeal: true }),
    }));
    expect(result.confidence).toBe(0.0);
  });
});

describe("heartbeat autonomy derivation", () => {
  it("auto-derives tasks when tier=2, mode=execute, cadence=30m", async () => {
    const result: HeartbeatResult = await handleEmptyQueue(makeCtx({
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.status).toBe("AUTO_DERIVED");
    expect(result.tasks!.length).toBeGreaterThan(0);
    expect(result.provenanceHash).toBeDefined();
  });

  it("enters quarantine when derivation yields no tasks", async () => {
    const result: HeartbeatResult = await handleEmptyQueue(makeCtx({
      phase: makePhase({ hasPlan: true, hasAudit: true, hasImplementation: true, hasSeal: true }),
    }));
    expect(result.status).toBe("QUARANTINE");
  });

  it("prompts user when tier=1", async () => {
    const result: HeartbeatResult = await handleEmptyQueue(makeCtx({
      tier: 1,
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.status).toBe("USER_PROMPT");
  });
});

describe("deriveAutonomy function", () => {
  it("returns FULL for tier=2 + execute + cadence >= 10", () => {
    expect(deriveAutonomy(makeCtx())).toBe(AutonomyLevel.FULL);
  });

  it("returns SUGGEST for tier=1", () => {
    expect(deriveAutonomy(makeCtx({ tier: 1 }))).toBe(AutonomyLevel.SUGGEST);
  });

  it("returns ASSISTED for tier=2 + idle mode", () => {
    expect(deriveAutonomy(makeCtx({ mode: "idle", cadence: 1 }))).toBe(AutonomyLevel.ASSISTED);
  });

  it("returns DELEGATED for tier=4", () => {
    expect(deriveAutonomy(makeCtx({ tier: 4 }))).toBe(AutonomyLevel.DELEGATED);
  });

  it("returns NONE for tier=0", () => {
    expect(deriveAutonomy(makeCtx({ tier: 0 }))).toBe(AutonomyLevel.NONE);
  });
});

describe("Forge-first task derivation", () => {
  beforeEach(() => mkdirSync(FORGE_TMP, { recursive: true }));
  afterEach(() => rmSync(FORGE_TMP, { recursive: true, force: true }));

  it("returns Forge task when queue has pending work", async () => {
    writeForgePhases([{
      phaseId: "p1", name: "Build", objective: "Build it", status: "active",
      tasks: [{ taskId: "t1", phaseId: "p1", title: "Do thing", description: "desc", status: "pending", priority: 1 }],
    }]);
    const result = await deriveTasksFromContext(makeCtx({
      forgeQueuePath: FORGE_PHASES,
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.tasks[0].source).toStartWith("forge:queue:");
    expect(result.tasks[0].id).toBe("t1");
  });

  it("falls back to lifecycle when Forge queue is empty", async () => {
    writeForgePhases([{
      phaseId: "p1", name: "Build", objective: "Build it", status: "active",
      tasks: [{ taskId: "t1", phaseId: "p1", title: "Done", description: "desc", status: "done", priority: 1 }],
    }]);
    const result = await deriveTasksFromContext(makeCtx({
      forgeQueuePath: FORGE_PHASES,
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.tasks[0].source).toBe("lifecycle:plan");
  });

  it("includes blocker tasks alongside Forge task", async () => {
    writeForgePhases([{
      phaseId: "p1", name: "Build", objective: "obj", status: "active",
      tasks: [{ taskId: "t1", phaseId: "p1", title: "Task", description: "desc", status: "pending", priority: 1 }],
    }]);
    const result = await deriveTasksFromContext(makeCtx({
      forgeQueuePath: FORGE_PHASES,
      blockers: ["Neo4j down"],
    }));
    expect(result.tasks.length).toBe(2);
    expect(result.tasks[0].source).toStartWith("forge:queue:");
    expect(result.tasks[1].source).toBe("blockers");
  });

  it("gracefully skips Forge when path is missing", async () => {
    const result = await deriveTasksFromContext(makeCtx({
      forgeQueuePath: "/nonexistent/phases.json",
      phase: makePhase({ hasPlan: false }),
    }));
    expect(result.tasks[0].source).toBe("lifecycle:plan");
  });

  it("heartbeat with Forge task returns AUTO_DERIVED", async () => {
    writeForgePhases([{
      phaseId: "p1", name: "Build", objective: "obj", status: "active",
      tasks: [{ taskId: "t1", phaseId: "p1", title: "Task", description: "desc", status: "pending", priority: 1 }],
    }]);
    const result = await handleEmptyQueue(makeCtx({
      forgeQueuePath: FORGE_PHASES,
    }));
    expect(result.status).toBe("AUTO_DERIVED");
    expect(result.tasks![0].source).toStartWith("forge:queue:");
  });
});

describe("forgeTaskToTask", () => {
  it("maps priority to urgency correctly", () => {
    expect(forgeTaskToTask({ taskId: "t", phaseId: "p", title: "T", description: "D", acceptance: [], priority: 1 }).urgency).toBe("high");
    expect(forgeTaskToTask({ taskId: "t", phaseId: "p", title: "T", description: "D", acceptance: [], priority: 4 }).urgency).toBe("medium");
    expect(forgeTaskToTask({ taskId: "t", phaseId: "p", title: "T", description: "D", acceptance: [], priority: 8 }).urgency).toBe("low");
  });
});
