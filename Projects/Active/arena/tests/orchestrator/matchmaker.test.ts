import { describe, it, expect, beforeEach } from "bun:test";
import { enqueue, start, clear, getMatch } from "../../src/orchestrator/matchmaker.ts";

describe("Matchmaker", () => {
  beforeEach(() => {
    clear();
  });

  it("enqueues a single agent without creating a match", () => {
    enqueue("agent-1");
    const result = start();
    expect(result).toBeNull();
  });

  it("creates a match when two agents are enqueued", () => {
    enqueue("agent-1");
    enqueue("agent-2");
    const result = start();
    expect(result).not.toBeNull();
    expect(result!.type).toBe("match_created");
    expect(result!.agentA).toBe("agent-1");
    expect(result!.agentB).toBe("agent-2");
    expect(result!.matchId).toMatch(/^match-\d{4}$/);
  });

  it("creates a unique match ID for each match", () => {
    enqueue("agent-1");
    enqueue("agent-2");
    const match1 = start();
    enqueue("agent-3");
    enqueue("agent-4");
    const match2 = start();
    expect(match1!.matchId).not.toBe(match2!.matchId);
  });

  it("does not create more matches when fewer than 2 agents are pending", () => {
    enqueue("agent-1");
    const r1 = start();
    expect(r1).toBeNull();
    enqueue("agent-2");
    const r2 = start();
    expect(r2).not.toBeNull();
  });

  it("getMatch returns the match state for a valid matchId", () => {
    enqueue("A");
    enqueue("B");
    const notification = start()!;
    const match = getMatch(notification.matchId);
    expect(match).toBeDefined();
    expect(match!.roundCap).toBeGreaterThan(0);
  });

  it("getMatch returns undefined for an unknown matchId", () => {
    expect(getMatch("unknown-match")).toBeUndefined();
  });
});
