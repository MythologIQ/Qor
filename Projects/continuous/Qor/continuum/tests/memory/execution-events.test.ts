import { describe, it, expect } from "bun:test";
import {
  createExecutionEvent,
  validateExecutionEvent,
  ValidationError,
} from "../../src/memory/ops/execution-events";

describe("memory/ops/execution-events validation", () => {
  it("validateExecutionEvent accepts a complete record", () => {
    const evt = {
      id: "exec-x",
      agentId: "victor",
      partition: "agent-private:victor",
      taskId: "t1",
      source: "heartbeat",
      status: "completed",
      timestamp: 100,
    };
    expect(validateExecutionEvent(evt).id).toBe("exec-x");
  });

  it("rejects missing required fields", () => {
    expect(() => validateExecutionEvent({ id: "x" })).toThrow(ValidationError);
  });

  it("rejects invalid status", () => {
    expect(() =>
      validateExecutionEvent({
        id: "x", agentId: "a", partition: "p", taskId: "t",
        source: "s", status: "bogus", timestamp: 1,
      }),
    ).toThrow(/status/);
  });

  it("rejects non-integer timestamp", () => {
    expect(() =>
      validateExecutionEvent({
        id: "x", agentId: "a", partition: "p", taskId: "t",
        source: "s", status: "completed", timestamp: -1,
      }),
    ).toThrow(/timestamp/);
  });

  describe("createExecutionEvent", () => {
    it("stamps partition from intent.agent", () => {
      const evt = createExecutionEvent(
        { taskId: "t", source: "heartbeat", agent: "qora" },
        { status: "completed" },
      );
      expect(evt.agentId).toBe("qora");
      expect(evt.partition).toBe("agent-private:qora");
    });

    it("defaults agent to victor when intent.agent missing", () => {
      const evt = createExecutionEvent(
        { taskId: "t", source: "heartbeat" },
        { status: "blocked" },
      );
      expect(evt.agentId).toBe("victor");
      expect(evt.partition).toBe("agent-private:victor");
    });

    it("derives acceptanceMet from array length", () => {
      const evt = createExecutionEvent(
        { taskId: "t", source: "heartbeat" },
        { status: "completed", acceptanceMet: ["criterion-1"] },
      );
      expect(evt.acceptanceMet).toBe(true);
    });

    it("passes acceptanceMet through when boolean", () => {
      const evt = createExecutionEvent(
        { taskId: "t", source: "heartbeat" },
        { status: "completed", acceptanceMet: false },
      );
      expect(evt.acceptanceMet).toBe(false);
    });

    it("maps result.reason → verdict", () => {
      const evt = createExecutionEvent(
        { taskId: "t", source: "heartbeat" },
        { status: "failed", reason: "forbidden" },
      );
      expect(evt.verdict).toBe("forbidden");
    });
  });
});
