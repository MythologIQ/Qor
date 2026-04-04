import { describe, it, expect } from "bun:test";
import {
  readJson,
  readLines,
  loadPhases,
  computeProgress,
  findActivePhase,
  countCompleted,
  buildProjectTree,
  PATHS,
} from "../src/api/status";

describe("readJson", () => {
  it("returns fallback for nonexistent file", () => {
    expect(readJson("/nonexistent/path.json", { x: 1 })).toEqual({ x: 1 });
  });

  it("reads valid JSON file", () => {
    const result = readJson(PATHS.forgeState, {});
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});

describe("readLines", () => {
  it("returns empty array for nonexistent file", () => {
    expect(readLines("/nonexistent/path.jsonl")).toEqual([]);
  });

  it("reads ledger lines", () => {
    const lines = readLines(PATHS.builderLedger);
    expect(Array.isArray(lines)).toBe(true);
  });
});

describe("loadPhases", () => {
  it("returns empty array for bad path", () => {
    expect(loadPhases("/nonexistent.json")).toEqual([]);
  });

  it("loads builder-console phases", () => {
    const phases = loadPhases(PATHS.builderPhases);
    expect(Array.isArray(phases)).toBe(true);
    expect(phases.length).toBeGreaterThan(0);
    expect(phases[0]).toHaveProperty("name");
    expect(phases[0]).toHaveProperty("tasks");
  });
});

describe("computeProgress", () => {
  it("returns 0 for empty phases", () => {
    const result = computeProgress([]);
    expect(result).toEqual({ percent: 0, completed: 0, total: 0 });
  });

  it("calculates correct percentage", () => {
    const phases = [
      { tasks: [{ status: "done" }, { status: "done" }, { status: "pending" }] },
    ];
    const result = computeProgress(phases);
    expect(result.percent).toBe(67);
    expect(result.completed).toBe(2);
    expect(result.total).toBe(3);
  });

  it("handles phases without tasks", () => {
    const phases = [{ name: "empty" }];
    const result = computeProgress(phases);
    expect(result.total).toBe(0);
  });
});

describe("findActivePhase", () => {
  it("returns null for no active phase", () => {
    expect(findActivePhase([{ status: "complete" }])).toBeNull();
  });

  it("finds active phase", () => {
    const phases = [
      { name: "A", status: "complete" },
      { name: "B", status: "active" },
    ];
    expect(findActivePhase(phases)?.name).toBe("B");
  });

  it("finds in-progress phase", () => {
    const phases = [{ name: "C", status: "in-progress" }];
    expect(findActivePhase(phases)?.name).toBe("C");
  });
});

describe("countCompleted", () => {
  it("counts done phases", () => {
    const phases = [
      { status: "done", tasks: [] },
      { status: "complete", tasks: [] },
      { status: "active", tasks: [{ status: "pending" }] },
    ];
    expect(countCompleted(phases).length).toBe(2);
  });

  it("counts phases where all tasks done", () => {
    const phases = [
      { status: "active", tasks: [{ status: "done" }, { status: "done" }] },
    ];
    expect(countCompleted(phases).length).toBe(1);
  });
});

describe("buildProjectTree", () => {
  it("returns array with root project", () => {
    const tree = buildProjectTree();
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe("qor-forge");
  });

  it("includes subProjects with phases", () => {
    const tree = buildProjectTree();
    const subs = tree[0].subProjects;
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.length).toBeGreaterThan(0);
    const bc = subs.find((s: any) => s.id === "builder-console");
    expect(bc).toBeDefined();
    expect(bc.phases.length).toBeGreaterThan(0);
    expect(bc.progress.percent).toBeGreaterThan(0);
  });
});
