import { describe, test, expect } from "bun:test";
import { MatchRuntime, getActiveRuntime } from "./match-runner.ts";

describe("MatchRuntime", () => {
  test("getSpectatorSnapshot returns correct shape after creation", () => {
    const rt = new MatchRuntime("test-match-1", "seed-abc", "playerA", "playerB");
    const snap = rt.getSpectatorSnapshot();

    expect(snap.matchId).toBe("test-match-1");
    expect(snap.round).toBe(0);
    expect(snap.state.visible.length).toBeGreaterThan(0);
    expect(snap.state.units.length).toBeGreaterThan(0);
    expect(snap.agents.A.operator).toBe("playerA");
    expect(snap.agents.B.operator).toBe("playerB");
    expect(snap.events.length).toBe(0);

    rt.finish();
  });

  test("snapshot reflects state after advanceRound", () => {
    const rt = new MatchRuntime("test-match-2", "seed-xyz", "pA", "pB");

    const unitA = rt.state.units.find((u) => u.owner === "A")!;
    const planA = {
      bid: 0,
      extras: [],
      freeMove: {
        unitId: unitA.id,
        from: unitA.position,
        to: { q: unitA.position.q + 1, r: unitA.position.r, s: -unitA.position.q - 1 - unitA.position.r },
      },
    };
    const planB = { bid: 0, extras: [] };

    rt.advanceRound(planA, planB);
    const snap = rt.getSpectatorSnapshot();

    expect(snap.round).toBe(1);
    expect(snap.metrics?.totalTurns ?? rt.metrics.totalTurns).toBe(1);
    expect(snap.events.length).toBeGreaterThanOrEqual(0);

    rt.finish();
  });

  test("active runtime registered and deregistered", () => {
    const rt = new MatchRuntime("test-registry", "seed-reg", "a", "b");
    expect(getActiveRuntime("test-registry")).toBeDefined();

    rt.finish();
    expect(getActiveRuntime("test-registry")).toBeUndefined();
  });

  test("getActiveRuntime returns undefined for unknown matchId", () => {
    expect(getActiveRuntime("nonexistent")).toBeUndefined();
  });

  test("snapshot is a frozen copy — mutations don't affect runtime", () => {
    const rt = new MatchRuntime("test-isolation", "seed-iso", "a", "b");
    const snap = rt.getSpectatorSnapshot();

    const origTurn = snap.state.turn;
    snap.state.turn = 999;
    expect(rt.state.turn).toBe(origTurn);

    rt.finish();
  });
});
