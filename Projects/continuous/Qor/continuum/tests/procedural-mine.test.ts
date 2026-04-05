import { describe, it, expect, afterAll } from "bun:test";
import {
  fingerprint,
  findRepeatingPatterns,
  createCandidateProcedure,
  checkOutcomeEvidence,
  promoteProcedure,
} from "../src/derive/procedural-mine";
import { closeDriver } from "../src/service/graph-api";
import type { Chain, Pattern, ProceduralNode } from "../src/derive/types";

afterAll(async () => {
  await closeDriver();
});

function makeChain(types: string[], session = "s1"): Chain {
  return {
    records: types.map((t, i) => ({
      id: `r${i}`, type: t, agent: "victor", entities: [], timestamp: 1000 + i * 100,
    })),
    sessionId: session,
  };
}

describe("fingerprint", () => {
  it("is deterministic for same action sequence", () => {
    const chain = makeChain(["observe", "analyze", "commit"]);
    expect(fingerprint(chain)).toBe(fingerprint(chain));
  });

  it("differs for different sequences", () => {
    const a = makeChain(["observe", "analyze", "commit"]);
    const b = makeChain(["commit", "analyze", "observe"]);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});

describe("findRepeatingPatterns", () => {
  it("groups matching fingerprints", () => {
    const chains = [
      makeChain(["a", "b", "c"], "s1"),
      makeChain(["a", "b", "c"], "s2"),
      makeChain(["x", "y", "z"], "s3"),
    ];
    const patterns = findRepeatingPatterns(chains, 2);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].chains).toHaveLength(2);
  });

  it("respects minimum occurrence threshold", () => {
    const chains = [
      makeChain(["a", "b", "c"]),
    ];
    const patterns = findRepeatingPatterns(chains, 2);
    expect(patterns).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(findRepeatingPatterns([])).toHaveLength(0);
  });
});

describe("createCandidateProcedure", () => {
  it("captures correct step sequence", () => {
    const pattern: Pattern = {
      fingerprint: "abc123",
      chains: [makeChain(["plan", "audit", "implement"]), makeChain(["plan", "audit", "implement"])],
      steps: [{ action: "plan" }, { action: "audit" }, { action: "implement" }],
    };
    const proc = createCandidateProcedure(pattern);
    expect(proc.status).toBe("candidate");
    expect(proc.label).toBe("plan → audit → implement");
    expect(proc.occurrences).toBe(2);
    expect(proc.steps).toHaveLength(3);
  });
});

describe("checkOutcomeEvidence", () => {
  it("identifies task completions", async () => {
    const proc: ProceduralNode = {
      id: "test", type: "procedural", status: "candidate",
      label: "test → task_complete",
      steps: [{ action: "test" }, { action: "task_complete" }],
      occurrences: 3, successRate: 0, firstSeen: "2026-01-01", lastSeen: "2026-01-01",
    };
    const evidence = await checkOutcomeEvidence(proc);
    expect(evidence.hasOutcome).toBe(true);
    expect(evidence.outcomeType).toBe("task_complete");
  });

  it("returns no outcome for non-terminal actions", async () => {
    const proc: ProceduralNode = {
      id: "test", type: "procedural", status: "candidate",
      label: "a → b",
      steps: [{ action: "a" }, { action: "b" }],
      occurrences: 3, successRate: 0, firstSeen: "2026-01-01", lastSeen: "2026-01-01",
    };
    const evidence = await checkOutcomeEvidence(proc);
    expect(evidence.hasOutcome).toBe(false);
  });
});

describe("promoteProcedure", () => {
  const candidate: ProceduralNode = {
    id: "test", type: "procedural", status: "candidate",
    label: "test", steps: [], occurrences: 5, successRate: 0,
    firstSeen: "2026-01-01", lastSeen: "2026-01-01",
  };

  it("flips status and sets metrics when threshold met", () => {
    const promoted = promoteProcedure(candidate, { successRate: 0.8, outcomeType: "task_complete" });
    expect(promoted.status).toBe("validated");
    expect(promoted.successRate).toBe(0.8);
    expect(promoted.outcomeType).toBe("task_complete");
  });

  it("stays candidate below occurrence threshold", () => {
    const low = { ...candidate, occurrences: 2 };
    const result = promoteProcedure(low, { successRate: 0.8, outcomeType: "task_complete" });
    expect(result.status).toBe("candidate");
  });

  it("stays candidate below success threshold", () => {
    const result = promoteProcedure(candidate, { successRate: 0.3, outcomeType: "task_complete" });
    expect(result.status).toBe("candidate");
  });
});
