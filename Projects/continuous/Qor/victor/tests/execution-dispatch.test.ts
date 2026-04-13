import { describe, it, expect } from "bun:test";
import {
  dispatchExecution,
  hasExecutionEvidence,
  isImplementationSource,
  toExecutionIntent,
  type ExecutionRunner,
} from "../src/heartbeat/execution-dispatch";

describe("dispatchExecution", () => {
  it("blocks forge tasks when no implementation runner is wired", async () => {
    const intent = toExecutionIntent({
      taskId: "t1",
      phaseId: "p1",
      title: "Do thing",
      description: "desc",
      acceptance: [],
      priority: 1,
    });
    const result = await dispatchExecution(intent);
    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("execution_runner_missing");
  });

  it("runs implementation tasks through the provided runner", async () => {
    const intent = toExecutionIntent({
      taskId: "t-run",
      phaseId: "p1",
      title: "Implement feature",
      description: "ship it",
      acceptance: [],
      priority: 1,
    });
    const runner: ExecutionRunner = {
      run: async () => ({
        status: "completed",
        summary: "runner executed task",
        filesChanged: ["victor/src/heartbeat/runtime.ts"],
        testsPassed: 3,
        acceptanceMet: ["AC1"],
      }),
    };

    const result = await dispatchExecution(intent, runner);
    expect(result.status).toBe("completed");
    expect(result.filesChanged).toEqual(["victor/src/heartbeat/runtime.ts"]);
    expect(result.testsPassed).toBe(3);
  });

  it("quarantines implementation runners that claim completion without evidence", async () => {
    const intent = toExecutionIntent({
      taskId: "t-empty",
      phaseId: "p1",
      title: "Implement feature",
      description: "ship it",
      acceptance: [],
      priority: 1,
    });
    const runner: ExecutionRunner = {
      run: async () => ({
        status: "completed",
        summary: "claimed success",
      }),
    };

    const result = await dispatchExecution(intent, runner);
    expect(result.status).toBe("quarantined");
    expect(result.reason).toBe("execution_evidence_missing");
  });

  it("blocks lifecycle tasks pending explicit operator execution", async () => {
    const result = await dispatchExecution({
      taskId: "t2",
      phaseId: "p2",
      source: "lifecycle:plan",
      title: "Plan",
      description: "desc",
      urgency: "high",
    });
    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("operator_execution_required");
  });

  it("blocks blocker tasks", async () => {
    const result = await dispatchExecution({
      taskId: "t3",
      phaseId: "p3",
      source: "blockers",
      title: "Resolve blockers",
      description: "dependency missing",
      urgency: "high",
    });
    expect(result.status).toBe("blocked");
  });

  it("quarantines unknown sources", async () => {
    const result = await dispatchExecution({
      taskId: "t4",
      phaseId: "p4",
      source: "mystery",
      title: "Mystery",
      description: "desc",
      urgency: "low",
    });
    expect(result.status).toBe("quarantined");
  });
});

describe("execution evidence guards", () => {
  it("identifies implementation sources", () => {
    expect(isImplementationSource("forge:queue:p1")).toBe(true);
    expect(isImplementationSource("lifecycle:implement")).toBe(true);
    expect(isImplementationSource("lifecycle:plan")).toBe(false);
  });

  it("requires non-empty execution evidence", () => {
    expect(hasExecutionEvidence({ status: "completed", summary: "ok" })).toBe(false);
    expect(hasExecutionEvidence({ status: "completed", summary: "ok", filesChanged: ["a.ts"] })).toBe(true);
    expect(hasExecutionEvidence({ status: "completed", summary: "ok", testsPassed: 1 })).toBe(true);
  });
});
