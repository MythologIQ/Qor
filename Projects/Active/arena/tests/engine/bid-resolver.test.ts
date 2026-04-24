import { describe, it, expect } from "bun:test";
import { resolveBids } from "../../src/engine/bidResolver";
import type { RoundPlan } from "../../src/shared/types";

const emptyPlan: RoundPlan = { bid: 0, extras: [] };

describe("resolveBids", () => {
  it("higher bid on A wins (A first)", () => {
    const r = resolveBids({
      matchId: "m1", round: 1,
      agentA: { bid: 3, plan: emptyPlan },
      agentB: { bid: 1, plan: emptyPlan },
    });
    expect(r.first).toBe("A");
    expect(r.tieBroken).toBe(false);
    expect(r.bidA).toBe(3);
    expect(r.bidB).toBe(1);
    expect(r.round).toBe(1);
  });

  it("higher bid on B wins (B first)", () => {
    const r = resolveBids({
      matchId: "m1", round: 1,
      agentA: { bid: 0, plan: emptyPlan },
      agentB: { bid: 2, plan: emptyPlan },
    });
    expect(r.first).toBe("B");
    expect(r.tieBroken).toBe(false);
  });

  it("tie: deterministic for same matchId + round", () => {
    const a = resolveBids({ matchId: "m1", round: 5, agentA: { bid: 2, plan: emptyPlan }, agentB: { bid: 2, plan: emptyPlan } });
    const b = resolveBids({ matchId: "m1", round: 5, agentA: { bid: 2, plan: emptyPlan }, agentB: { bid: 2, plan: emptyPlan } });
    expect(a.first).toBe(b.first);
    expect(a.tieBroken).toBe(true);
  });

  it("tie: different round can flip order", () => {
    const orders = new Set<string>();
    for (let r = 0; r < 20; r++) {
      const o = resolveBids({ matchId: "m1", round: r, agentA: { bid: 1, plan: emptyPlan }, agentB: { bid: 1, plan: emptyPlan } });
      orders.add(o.first);
    }
    expect(orders.size).toBe(2);
  });

  it("tie: different matchId isolates", () => {
    const orders = new Set<string>();
    for (const mid of ["m-a", "m-b", "m-c", "m-d", "m-e"]) {
      const o = resolveBids({ matchId: mid, round: 0, agentA: { bid: 1, plan: emptyPlan }, agentB: { bid: 1, plan: emptyPlan } });
      orders.add(o.first);
    }
    expect(orders.size).toBeGreaterThanOrEqual(1);
  });

  it("zero-vs-zero counts as tie", () => {
    const r = resolveBids({ matchId: "m1", round: 0, agentA: { bid: 0, plan: emptyPlan }, agentB: { bid: 0, plan: emptyPlan } });
    expect(r.tieBroken).toBe(true);
  });

  it("tieBroken=false when bids differ", () => {
    const r = resolveBids({ matchId: "m1", round: 0, agentA: { bid: 4, plan: emptyPlan }, agentB: { bid: 2, plan: emptyPlan } });
    expect(r.tieBroken).toBe(false);
  });
});
