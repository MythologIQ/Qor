import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { readForgeQueue, selectNextTask, isTaskEligible } from "../src/heartbeat/forge-queue";

const TMP_DIR = "/tmp/forge-queue-test";
const PHASES_PATH = `${TMP_DIR}/phases.json`;

function writePhases(phases: unknown[]) {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(PHASES_PATH, JSON.stringify({ phases }));
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "task_001",
    phaseId: "phase_001",
    title: "Test task",
    description: "A test task",
    acceptance: ["criterion 1"],
    status: "pending",
    priority: 5,
    ...overrides,
  };
}

function makePhase(overrides: Record<string, unknown> = {}) {
  return {
    phaseId: "phase_001",
    name: "Test Phase",
    objective: "Test objective",
    status: "active",
    tasks: [makeTask()],
    ...overrides,
  };
}

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("readForgeQueue", () => {
  it("returns the active phase's first pending task", () => {
    writePhases([makePhase()]);
    const result = readForgeQueue(PHASES_PATH);
    expect(result.task).not.toBeNull();
    expect(result.task!.taskId).toBe("task_001");
    expect(result.activePhase!.name).toBe("Test Phase");
    expect(result.queueDepth).toBe(1);
  });

  it("returns null when all tasks are done", () => {
    writePhases([makePhase({ tasks: [makeTask({ status: "done" })] })]);
    const result = readForgeQueue(PHASES_PATH);
    expect(result.task).toBeNull();
    expect(result.queueDepth).toBe(0);
  });

  it("returns null when no active phase exists", () => {
    writePhases([makePhase({ status: "complete" })]);
    const result = readForgeQueue(PHASES_PATH);
    expect(result.task).toBeNull();
    expect(result.activePhase).toBeNull();
  });

  it("returns null when file doesn't exist", () => {
    const result = readForgeQueue("/nonexistent/phases.json");
    expect(result.task).toBeNull();
    expect(result.queueDepth).toBe(0);
  });

  it("finds in-progress phases too", () => {
    writePhases([makePhase({ status: "in-progress" })]);
    const result = readForgeQueue(PHASES_PATH);
    expect(result.task).not.toBeNull();
  });

  it("flattens nested child tasks", () => {
    const parent = makeTask({
      taskId: "parent",
      status: "done",
      children: [makeTask({ taskId: "child", status: "pending" })],
    });
    writePhases([makePhase({ tasks: [parent] })]);
    const result = readForgeQueue(PHASES_PATH);
    expect(result.task!.taskId).toBe("child");
  });
});

describe("selectNextTask", () => {
  it("picks highest priority task", () => {
    const tasks = [
      makeTask({ taskId: "low", priority: 10 }),
      makeTask({ taskId: "high", priority: 1 }),
      makeTask({ taskId: "mid", priority: 5 }),
    ];
    const result = selectNextTask(tasks);
    expect(result!.taskId).toBe("high");
  });

  it("returns null for empty array", () => {
    expect(selectNextTask([])).toBeNull();
  });

  it("handles tasks without priority (defaults to 99)", () => {
    const tasks = [
      makeTask({ taskId: "no_pri", priority: undefined }),
      makeTask({ taskId: "has_pri", priority: 3 }),
    ];
    const result = selectNextTask(tasks);
    expect(result!.taskId).toBe("has_pri");
  });
});

describe("isTaskEligible", () => {
  it("returns true for pending", () => {
    expect(isTaskEligible(makeTask({ status: "pending" }) as any)).toBe(true);
  });

  it("returns true for planned", () => {
    expect(isTaskEligible(makeTask({ status: "planned" }) as any)).toBe(true);
  });

  it("returns false for done", () => {
    expect(isTaskEligible(makeTask({ status: "done" }) as any)).toBe(false);
  });

  it("returns false for active", () => {
    expect(isTaskEligible(makeTask({ status: "active" }) as any)).toBe(false);
  });

  it("returns false for blocked", () => {
    expect(isTaskEligible(makeTask({ status: "blocked" }) as any)).toBe(false);
  });
});
