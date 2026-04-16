import { describe, expect, it } from "bun:test";
import {
  promoteClaimableChildTasks,
  toSortablePriority,
} from "../src/projects/task-promotion";

function makeChild(overrides: Record<string, unknown> = {}) {
  return {
    title: "Child task",
    description: "Child description",
    status: "planned",
    priority: "P1",
    children: [],
    ...overrides,
  };
}

function makeParent(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "parent_task",
    title: "Parent task",
    description: "Parent description",
    status: "done",
    priority: "P0",
    children: [makeChild()],
    ...overrides,
  };
}

describe("promoteClaimableChildTasks", () => {
  it("promotes planned children of completed parents into top-level tasks", () => {
    const phases = [
      {
        phaseId: "phase_1",
        status: "active",
        tasks: [makeParent()],
      },
    ];
    const changed = promoteClaimableChildTasks(phases as any);
    expect(changed).toBe(true);
    expect(phases[0].tasks).toHaveLength(2);
    expect(phases[0].tasks[1].taskId).toBe("parent_task__child_1");
    expect(phases[0].tasks[1].status).toBe("planned");
    expect(phases[0].tasks[1].priority).toBe(1);
  });

  it("promotes planned children of active parents", () => {
    const phases = [
      {
        phaseId: "phase_1",
        status: "active",
        tasks: [makeParent({ status: "active" })],
      },
    ];
    promoteClaimableChildTasks(phases as any);
    expect(phases[0].tasks[1].taskId).toBe("parent_task__child_1");
  });

  it("does not promote children of planned parents", () => {
    const phases = [
      {
        phaseId: "phase_1",
        status: "active",
        tasks: [makeParent({ status: "planned" })],
      },
    ];
    const changed = promoteClaimableChildTasks(phases as any);
    expect(changed).toBe(false);
    expect(phases[0].tasks).toHaveLength(1);
  });

  it("does not duplicate already promoted child tasks", () => {
    const phases = [
      {
        phaseId: "phase_1",
        status: "active",
        tasks: [
          makeParent(),
          {
            taskId: "parent_task__child_1",
            title: "Child task",
            description: "Child description",
            status: "planned",
            priority: 1,
            children: [],
          },
        ],
      },
    ];
    const changed = promoteClaimableChildTasks(phases as any);
    expect(changed).toBe(false);
    expect(phases[0].tasks).toHaveLength(2);
  });
});

describe("toSortablePriority", () => {
  it("maps P0 style priority labels to numbers", () => {
    expect(toSortablePriority("P0")).toBe(0);
    expect(toSortablePriority("P2")).toBe(2);
  });

  it("falls back to 99 for unknown values", () => {
    expect(toSortablePriority(undefined)).toBe(99);
    expect(toSortablePriority("high")).toBe(99);
  });
});
