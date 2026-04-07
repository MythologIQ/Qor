import { describe, it, expect } from "bun:test";
import {
  dispatchExecution,
  toExecutionIntent,
} from "../src/heartbeat/execution-dispatch";

describe("dispatchExecution", () => {
  it("completes forge tasks", async () => {
    const intent = toExecutionIntent({
      taskId: "t1",
      phaseId: "p1",
      title: "Do thing",
      description: "desc",
      acceptance: [],
      priority: 1,
    });
    const result = await dispatchExecution(intent);
    expect(result.status).toBe("completed");
  });

  it("completes lifecycle tasks", async () => {
    const result = await dispatchExecution({
      taskId: "t2",
      phaseId: "p2",
      source: "lifecycle:plan",
      title: "Plan",
      description: "desc",
      urgency: "high",
    });
    expect(result.status).toBe("completed");
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
