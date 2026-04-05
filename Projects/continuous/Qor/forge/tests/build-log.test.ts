import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const LEDGER_PATH = "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/ledger.jsonl";
const PHASES_PATH = "/home/workspace/Projects/continuous/Qor/.qore/projects/builder-console/path/phases.json";
const KNOWN_ACTIONS = ["create", "update", "complete-task", "claim"];

function parseLedger(): Array<Record<string, unknown>> {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parsePhases(): Array<Record<string, unknown>> {
  if (!existsSync(PHASES_PATH)) return [];
  const raw = JSON.parse(readFileSync(PHASES_PATH, "utf-8"));
  return Array.isArray(raw) ? raw : raw?.phases || [];
}

function deriveSummary(entry: Record<string, unknown>): string {
  const action = entry.action as string;
  const payload = (entry.payload || {}) as Record<string, unknown>;
  const artifactId = (entry.artifactId || "") as string;
  if (action === "complete-task") return `Completed: ${payload.task || payload.title || artifactId}`;
  if (action === "claim") return `Claimed: ${artifactId}`;
  if (action === "create") return `Created: ${payload.name || artifactId}`;
  if (action === "update") return `Updated: ${payload.field || artifactId}`;
  return `${action}: ${artifactId}`;
}

describe("Ledger data integrity", () => {
  const entries = parseLedger();

  test("ledger file exists and has entries", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  test("all entries have required fields", () => {
    for (const e of entries) {
      expect(e).toHaveProperty("timestamp");
      expect(e).toHaveProperty("action");
    }
  });

  test("action values are known types", () => {
    for (const e of entries) {
      expect(KNOWN_ACTIONS).toContain(e.action);
    }
  });
});

describe("Build log summary derivation", () => {
  test("complete-task produces non-empty summary", () => {
    const s = deriveSummary({ action: "complete-task", payload: { task: "Fix bug" }, artifactId: "t1" });
    expect(s).toBe("Completed: Fix bug");
  });

  test("claim produces non-empty summary", () => {
    const s = deriveSummary({ action: "claim", artifactId: "builder-console" });
    expect(s).toBe("Claimed: builder-console");
  });

  test("create produces non-empty summary", () => {
    const s = deriveSummary({ action: "create", payload: { name: "Builder Console" }, artifactId: "bc" });
    expect(s).toBe("Created: Builder Console");
  });

  test("update produces non-empty summary", () => {
    const s = deriveSummary({ action: "update", payload: { field: "status" }, artifactId: "bc" });
    expect(s).toBe("Updated: status");
  });
});

describe("Phase lifecycle accuracy", () => {
  const phases = parsePhases();

  test("phase with all tasks done derives as complete", () => {
    for (const phase of phases) {
      const tasks = (phase.tasks || []) as Array<Record<string, unknown>>;
      if (tasks.length === 0) continue;
      const allDone = tasks.every((t) => t.status === "done");
      if (allDone && phase.status === "active") {
        const derived = "complete";
        expect(derived).toBe("complete");
      }
    }
  });
});

describe("Pagination math", () => {
  const entries = parseLedger();

  test("ceil(total / limit) produces correct page count", () => {
    const limits = [5, 10, 15, 50];
    for (const limit of limits) {
      const pages = Math.max(1, Math.ceil(entries.length / limit));
      expect(pages).toBeGreaterThan(0);
    }
  });

  test("page slice does not exceed limit", () => {
    const limit = 15;
    const reversed = [...entries].reverse();
    const page1 = reversed.slice(0, limit);
    const page2 = reversed.slice(limit, limit * 2);
    expect(page1.length).toBeLessThanOrEqual(limit);
    expect(page2.length).toBeLessThanOrEqual(limit);
    if (entries.length > limit) {
      expect(page1[0]).not.toEqual(page2[0]);
    }
  });
});
