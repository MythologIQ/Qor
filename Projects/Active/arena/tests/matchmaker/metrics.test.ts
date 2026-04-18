import { describe, expect, it, beforeEach } from "bun:test";
import { MatchmakerMetrics, matchmakerMetrics } from "../../src/matchmaker/metrics";

describe("MatchmakerMetrics", () => {
  let metrics: MatchmakerMetrics;

  beforeEach(() => {
    metrics = new MatchmakerMetrics();
  });

  describe("initial state", () => {
    it("counters start at 0", () => {
      expect(metrics.pairsFormed).toBe(0);
      expect(metrics.enqueueCount).toBe(0);
    });
  });

  describe("incPair", () => {
    it("increments pairsFormed", () => {
      metrics.incPair();
      expect(metrics.pairsFormed).toBe(1);
    });

    it("accumulates across multiple calls", () => {
      metrics.incPair();
      metrics.incPair();
      metrics.incPair();
      expect(metrics.pairsFormed).toBe(3);
    });
  });

  describe("incEnqueue", () => {
    it("increments enqueueCount", () => {
      metrics.incEnqueue();
      expect(metrics.enqueueCount).toBe(1);
    });

    it("accumulates across multiple calls", () => {
      metrics.incEnqueue();
      metrics.incEnqueue();
      expect(metrics.enqueueCount).toBe(2);
    });
  });

  describe("snapshot", () => {
    it("returns plain values for pairsFormed", () => {
      metrics.incPair();
      metrics.incPair();
      const snap = metrics.snapshot();
      expect(typeof snap.pairsFormed).toBe("number");
      expect(snap.pairsFormed).toBe(2);
    });

    it("returns plain values for enqueueCount", () => {
      metrics.incEnqueue();
      const snap = metrics.snapshot();
      expect(typeof snap.enqueueCount).toBe("number");
      expect(snap.enqueueCount).toBe(1);
    });

    it("returns current state, not a live reference", () => {
      const snap = metrics.snapshot();
      metrics.incPair();
      expect(snap.pairsFormed).toBe(0);
    });
  });

  describe("singleton export", () => {
    it("matchmakerMetrics is a MatchmakerMetrics instance", () => {
      expect(matchmakerMetrics).toBeInstanceOf(MatchmakerMetrics);
    });

    it("singleton increments independently", () => {
      const initial = matchmakerMetrics.snapshot();
      matchmakerMetrics.incPair();
      matchmakerMetrics.incEnqueue();
      const after = matchmakerMetrics.snapshot();
      expect(after.pairsFormed).toBe(initial.pairsFormed + 1);
      expect(after.enqueueCount).toBe(initial.enqueueCount + 1);
    });
  });
});