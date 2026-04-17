import { describe, it, expect } from "bun:test";
import {
  dispatchExecution,
  type ExecutionIntent,
  type ExecutionResult,
  type ExecutionRunner,
} from "../src/heartbeat/execution-dispatch";
import type { ExecutionEvent, ExecutionEventStore, ExecutionQuery } from "../src/kernel/memory/store";

function makeIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    taskId: "task_42",
    phaseId: "phase_15",
    source: "forge:queue:phase_15",
    title: "test task",
    description: "exercise emit path",
    acceptance: [],
    urgency: "low",
    ...overrides,
  };
}

class RecordingStore implements ExecutionEventStore {
  public readonly events: ExecutionEvent[] = [];
  public throwOnce = false;
  async record(event: ExecutionEvent): Promise<{ id: string }> {
    if (this.throwOnce) {
      this.throwOnce = false;
      throw new Error("continuum unavailable");
    }
    this.events.push(event);
    return { id: event.id };
  }
  async queryExecutions(_filter: ExecutionQuery): Promise<ExecutionEvent[]> {
    return [];
  }
}

const successRunner: ExecutionRunner = {
  async run(_intent) {
    return {
      status: "completed",
      summary: "ok",
      testsPassed: 3,
      filesChanged: ["a.ts"],
      acceptanceMet: ["ac1"],
    } satisfies ExecutionResult;
  },
};

describe("execution-dispatch emit", () => {
  it("emits an ExecutionEvent stamped with agent-private partition on completion", async () => {
    const store = new RecordingStore();
    const result = await dispatchExecution(makeIntent(), {
      runner: successRunner,
      executionEventStore: store,
      agentId: "victor",
      now: () => 1700000000000,
      rng: () => "evt_fixed",
    });
    expect(result.status).toBe("completed");
    expect(store.events).toHaveLength(1);
    const ev = store.events[0];
    expect(ev.id).toBe("evt_fixed");
    expect(ev.partition).toBe("agent-private:victor");
    expect(ev.taskId).toBe("task_42");
    expect(ev.source).toBe("forge:queue:phase_15");
    expect(ev.status).toBe("completed");
    expect(ev.testsPassed).toBe(3);
    expect(ev.acceptanceMet).toBe(true);
    expect(ev.timestamp).toBe(1700000000000);
  });

  it("emits a blocked event when runner is missing", async () => {
    const store = new RecordingStore();
    const result = await dispatchExecution(makeIntent(), {
      executionEventStore: store,
      agentId: "victor",
    });
    expect(result.status).toBe("blocked");
    expect(store.events).toHaveLength(1);
    expect(store.events[0].status).toBe("blocked");
    expect(store.events[0].verdict).toBe("execution_runner_missing");
  });

  it("emits a quarantined event when completed without evidence", async () => {
    const store = new RecordingStore();
    const noEvidenceRunner: ExecutionRunner = {
      async run() {
        return { status: "completed", summary: "nothing happened" };
      },
    };
    const result = await dispatchExecution(makeIntent(), {
      runner: noEvidenceRunner,
      executionEventStore: store,
    });
    expect(result.status).toBe("quarantined");
    expect(store.events).toHaveLength(1);
    expect(store.events[0].status).toBe("quarantined");
    expect(store.events[0].verdict).toBe("execution_evidence_missing");
  });

  it("fails open when store.record throws (dispatch still returns result)", async () => {
    const store = new RecordingStore();
    store.throwOnce = true;
    const result = await dispatchExecution(makeIntent(), {
      runner: successRunner,
      executionEventStore: store,
    });
    expect(result.status).toBe("completed");
    expect(store.events).toHaveLength(0);
  });

  it("does nothing when no executionEventStore is supplied (back-compat)", async () => {
    const result = await dispatchExecution(makeIntent(), { runner: successRunner });
    expect(result.status).toBe("completed");
  });

  it("accepts legacy positional runner argument (back-compat)", async () => {
    const result = await dispatchExecution(makeIntent(), successRunner);
    expect(result.status).toBe("completed");
  });
});
