import { describe, it, expect, beforeEach } from "bun:test";
import { Metrics } from "../../src/orchestrator/metrics.ts";

describe("Metrics", () => {
  let m: Metrics;

  beforeEach(() => {
    m = new Metrics();
  });

  it("records a single valid action", () => {
    m.recordAction("A", 10, true);
    m.recordTurn();
    const result = m.finalize();
    expect(result.totalActions).toBe(1);
    expect(result.invalidActions).toBe(0);
    expect(result.turnsPlayed).toBe(1);
  });

  it("records invalid actions", () => {
    m.recordAction("A", 5, false);
    m.recordAction("B", 7, false);
    m.recordTurn();
    const result = m.finalize();
    expect(result.invalidActions).toBe(2);
  });

  it("computes avgDecisionMs across actions", () => {
    m.recordAction("A", 10, true);
    m.recordAction("B", 20, true);
    m.recordTurn();
    const result = m.finalize();
    expect(result.avgDecisionMs).toBe(15);
  });

  it("counts turns played", () => {
    m.recordAction("A", 5, true);
    m.recordTurn();
    m.recordAction("B", 5, true);
    m.recordTurn();
    const result = m.finalize();
    expect(result.turnsPlayed).toBe(2);
  });

  it("finalize produces complete MatchMetrics", () => {
    m.recordAction("A", 30, true);
    m.recordTurn();
    const result = m.finalize();
    expect(result).toHaveProperty("totalActions");
    expect(result).toHaveProperty("avgDecisionMs");
    expect(result).toHaveProperty("invalidActions");
    expect(result).toHaveProperty("turnsPlayed");
    expect(result).toHaveProperty("durationMs");
  });

  it("durationMs reflects elapsed time", () => {
    const start = Date.now();
    m.recordAction("A", 5, true);
    m.recordTurn();
    const result = m.finalize();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});