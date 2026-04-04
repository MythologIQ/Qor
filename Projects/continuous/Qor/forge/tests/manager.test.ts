import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";

const TEST_DIR = "/tmp/forge-manager-test";
const TEST_PHASES_PATH = `${TEST_DIR}/phases.json`;
const TEST_LEDGER_PATH = `${TEST_DIR}/ledger.jsonl`;

const SAMPLE_PHASES = {
  phases: [
    {
      phaseId: "phase_test_1",
      projectId: "test",
      ordinal: 1,
      name: "Test Phase",
      objective: "Testing",
      tasks: [
        { taskId: "task_1", title: "First task", status: "pending", description: "", acceptance: [], priority: 3, priorityLabel: "medium", children: [] },
        { taskId: "task_2", title: "Second task", status: "done", description: "", acceptance: [], priority: 3, priorityLabel: "medium", children: [] },
      ],
      status: "active",
      createdAt: "2026-04-01T00:00:00Z",
      updatedAt: "2026-04-01T00:00:00Z",
    },
  ],
};

function setupTestFiles() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TEST_PHASES_PATH, JSON.stringify(SAMPLE_PHASES, null, 2));
  writeFileSync(TEST_LEDGER_PATH, "");
}

describe("manager operations (unit logic)", () => {
  beforeEach(setupTestFiles);
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("reads phases from test file", () => {
    const raw = JSON.parse(readFileSync(TEST_PHASES_PATH, "utf-8"));
    expect(raw.phases.length).toBe(1);
    expect(raw.phases[0].tasks.length).toBe(2);
  });

  it("can update task status in phases file", () => {
    const raw = JSON.parse(readFileSync(TEST_PHASES_PATH, "utf-8"));
    const task = raw.phases[0].tasks.find((t: any) => t.taskId === "task_1");
    expect(task.status).toBe("pending");
    task.status = "done";
    writeFileSync(TEST_PHASES_PATH, JSON.stringify(raw, null, 2));
    const updated = JSON.parse(readFileSync(TEST_PHASES_PATH, "utf-8"));
    expect(updated.phases[0].tasks[0].status).toBe("done");
  });

  it("can append ledger entry", () => {
    const entry = JSON.stringify({ action: "test", timestamp: new Date().toISOString() });
    writeFileSync(TEST_LEDGER_PATH, entry + "\n", { flag: "a" });
    const lines = readFileSync(TEST_LEDGER_PATH, "utf-8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).action).toBe("test");
  });

  it("can create a new phase", () => {
    const raw = JSON.parse(readFileSync(TEST_PHASES_PATH, "utf-8"));
    const newPhase = {
      phaseId: `phase_${Date.now().toString(36)}`,
      projectId: "test",
      ordinal: raw.phases.length + 1,
      name: "New Phase",
      objective: "Test objective",
      tasks: [{ taskId: "task_new_1", title: "New task", status: "pending" }],
      status: "planned",
    };
    raw.phases.push(newPhase);
    writeFileSync(TEST_PHASES_PATH, JSON.stringify(raw, null, 2));
    const updated = JSON.parse(readFileSync(TEST_PHASES_PATH, "utf-8"));
    expect(updated.phases.length).toBe(2);
    expect(updated.phases[1].name).toBe("New Phase");
  });

  it("can record evidence to ledger", () => {
    const entries = [
      { action: "record-evidence", sessionId: "s1", kind: "test-result", payload: { pass: true } },
      { action: "record-evidence", sessionId: "s1", kind: "code-delta", payload: { files: 1 } },
    ];
    for (const e of entries) {
      const line = JSON.stringify({ ...e, timestamp: new Date().toISOString() });
      writeFileSync(TEST_LEDGER_PATH, line + "\n", { flag: "a" });
    }
    const lines = readFileSync(TEST_LEDGER_PATH, "utf-8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).kind).toBe("test-result");
    expect(JSON.parse(lines[1]).kind).toBe("code-delta");
  });

  it("can update risk in ledger", () => {
    const entry = JSON.stringify({
      action: "update-risk",
      title: "Import fragility",
      severity: "medium",
      owner: "forge",
      timestamp: new Date().toISOString(),
    });
    writeFileSync(TEST_LEDGER_PATH, entry + "\n", { flag: "a" });
    const lines = readFileSync(TEST_LEDGER_PATH, "utf-8").trim().split("\n").filter(Boolean);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.action).toBe("update-risk");
    expect(parsed.title).toBe("Import fragility");
  });

  it("handles missing task gracefully", () => {
    const raw = JSON.parse(readFileSync(TEST_PHASES_PATH, "utf-8"));
    const allTasks = raw.phases.flatMap((p: any) => p.tasks || []);
    const found = allTasks.find((t: any) => t.taskId === "nonexistent");
    expect(found).toBeUndefined();
  });
});
