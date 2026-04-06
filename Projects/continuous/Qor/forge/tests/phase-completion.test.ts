import { describe, it, expect } from "bun:test";
import {
  checkPhaseCompletion,
  buildPhaseCompletionLedgerEntry,
} from "../src/api/phase-completion";

function makePhase(overrides: Record<string, unknown> = {}) {
  return {
    phaseId: "phase_01",
    name: "Build Phase",
    ordinal: 1,
    status: "active",
    tasks: [
      { status: "done" },
      { status: "done" },
    ],
    ...overrides,
  };
}

describe("checkPhaseCompletion", () => {
  it("returns transition when all tasks done", () => {
    const phases = [makePhase()];
    const result = checkPhaseCompletion(phases, "phase_01");
    expect(result).not.toBeNull();
    expect(result!.completedPhaseId).toBe("phase_01");
    expect(result!.completedPhaseName).toBe("Build Phase");
    expect(phases[0].status).toBe("complete");
  });

  it("returns null when tasks remain", () => {
    const phases = [makePhase({ tasks: [{ status: "done" }, { status: "pending" }] })];
    const result = checkPhaseCompletion(phases, "phase_01");
    expect(result).toBeNull();
    expect(phases[0].status).toBe("active");
  });

  it("returns null for empty tasks", () => {
    const phases = [makePhase({ tasks: [] })];
    expect(checkPhaseCompletion(phases, "phase_01")).toBeNull();
  });

  it("returns null for unknown phaseId", () => {
    const phases = [makePhase()];
    expect(checkPhaseCompletion(phases, "nonexistent")).toBeNull();
  });

  it("promotes next planned phase", () => {
    const phases = [
      makePhase({ phaseId: "p1", ordinal: 1 }),
      makePhase({ phaseId: "p2", ordinal: 2, status: "planned", tasks: [{ status: "pending" }] }),
    ];
    const result = checkPhaseCompletion(phases, "p1");
    expect(result!.promotedPhaseId).toBe("p2");
    expect(phases[1].status).toBe("active");
  });

  it("returns null promoted when no next phase exists", () => {
    const phases = [makePhase({ phaseId: "p1", ordinal: 1 })];
    const result = checkPhaseCompletion(phases, "p1");
    expect(result!.promotedPhaseId).toBeNull();
  });

  it("skips non-planned phases for promotion", () => {
    const phases = [
      makePhase({ phaseId: "p1", ordinal: 1 }),
      makePhase({ phaseId: "p2", ordinal: 2, status: "complete", tasks: [{ status: "done" }] }),
      makePhase({ phaseId: "p3", ordinal: 3, status: "planned", tasks: [{ status: "pending" }] }),
    ];
    const result = checkPhaseCompletion(phases, "p1");
    expect(result!.promotedPhaseId).toBe("p3");
  });

  it("treats 'complete' task status as done", () => {
    const phases = [makePhase({ tasks: [{ status: "complete" }, { status: "done" }] })];
    const result = checkPhaseCompletion(phases, "phase_01");
    expect(result).not.toBeNull();
  });
});

describe("buildPhaseCompletionLedgerEntry", () => {
  it("creates correct ledger shape", () => {
    const transition = {
      completedPhaseId: "p1",
      completedPhaseName: "Phase 1",
      promotedPhaseId: "p2",
      promotedPhaseName: "Phase 2",
      timestamp: "2026-04-06T05:00:00Z",
    };
    const entry = buildPhaseCompletionLedgerEntry(transition, "builder-console");
    expect(entry.projectId).toBe("builder-console");
    expect(entry.action).toBe("complete-phase");
    expect(entry.actorId).toBe("forge:auto");
    expect(entry.payload.completedPhase).toBe("Phase 1");
    expect(entry.payload.promotedPhase).toBe("Phase 2");
  });
});
