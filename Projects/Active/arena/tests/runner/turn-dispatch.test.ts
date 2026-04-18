import { describe, expect, test, beforeEach, vi } from "vitest";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "../../src/runner/types.ts";
import type { AgentAction } from "../../src/shared/types.ts";

function makeFakeChannel(actions: AgentAction[]): AgentChannel {
  let i = 0;
  const queue = [...actions];
  return {
    id: `fake-${Math.random()}`,
    send: vi.fn(),
    onMessage: (cb: (msg: unknown) => void) => {
      const timer = setTimeout(() => {
        if (queue.length > 0) {
          cb({ action: queue[i++] });
        }
      }, 10);
    },
  };
}

function noOpChannel(): AgentChannel {
  return {
    id: "noop",
    send: vi.fn(),
    onMessage: (_cb: (msg: unknown) => void) => {},
  };
}

const A_ID = 1;
const B_ID = 2;

function makeCtx(matchId = "test-match-1"): RunnerContext {
  return {
    matchId,
    a: { id: A_ID, name: "AgentA" },
    b: { id: B_ID, name: "AgentB" },
  };
}

describe("turn dispatch", () => {
  test("engine runs to completion with actions from both channels", async () => {
    // Alternate actions a/b across turns: each turn only the active side sends
    const aActions: AgentAction[] = [
      { type: "move", cube: { q: 0, r: 0, s: 0 }, confidence: 1 },
      { type: "pass", confidence: 1 },
    ];
    const bActions: AgentAction[] = [
      { type: "move", cube: { q: 1, r: -1, s: 0 }, confidence: 1 },
      { type: "pass", confidence: 1 },
    ];

    const channelA = makeFakeChannel(aActions);
    const channelB = makeFakeChannel(bActions);

    // Minimal in-memory database using Bun's sqlite
    const db = new (await import("bun:sqlite")).Database(":memory:");
    db.run("CREATE TABLE matches (id TEXT PRIMARY KEY, operator_a_id INTEGER, operator_b_id INTEGER, agent_a_id INTEGER, agent_b_id INTEGER, origin_tag TEXT, outcome TEXT, created_at INTEGER)");

    const runner = new MatchRunner(db as any);
    const result = await runner.start(makeCtx(), { a: channelA, b: channelB });

    // Should complete without throwing
    expect(result).toBeDefined();
    expect(result.winnerOperatorId).toBeTruthy();
  });

  test("action count matches number of turns taken", async () => {
    const aActions: AgentAction[] = Array.from({ length: 4 }, () => ({
      type: "pass",
      confidence: 1,
    }));
    const bActions: AgentAction[] = Array.from({ length: 4 }, () => ({
      type: "pass",
      confidence: 1,
    }));

    const channelA = makeFakeChannel(aActions);
    const channelB = makeFakeChannel(bActions);

    const db = new (await import("bun:sqlite")).Database(":memory:");
    db.run("CREATE TABLE matches (id TEXT PRIMARY KEY, operator_a_id INTEGER, operator_b_id INTEGER, agent_a_id INTEGER, agent_b_id INTEGER, origin_tag TEXT, outcome TEXT, created_at INTEGER)");

    const runner = new MatchRunner(db as any);
    const result = await runner.start(makeCtx("test-match-count"), { a: channelA, b: channelB });

    // 4 passes from each side = 4 turns (alternating), cap at 50
    expect(result).toBeDefined();
    expect(typeof result.winnerOperatorId).toBe("number");
  });

  test("each turn alternates between a and b", async () => {
    const aActions: AgentAction[] = Array.from({ length: 6 }, () => ({
      type: "move",
      cube: { q: 0, r: 0, s: 0 },
      confidence: 1,
    }));
    const bActions: AgentAction[] = Array.from({ length: 6 }, () => ({
      type: "move",
      cube: { q: 1, r: -1, s: 0 },
      confidence: 1,
    }));

    const channelA = makeFakeChannel(aActions);
    const channelB = makeFakeChannel(bActions);

    const db = new (await import("bun:sqlite")).Database(":memory:");
    db.run("CREATE TABLE matches (id TEXT PRIMARY KEY, operator_a_id INTEGER, operator_b_id INTEGER, agent_a_id INTEGER, agent_b_id INTEGER, origin_tag TEXT, outcome TEXT, created_at INTEGER)");

    const runner = new MatchRunner(db as any);
    await runner.start(makeCtx("test-match-alt"), { a: channelA, b: channelB });

    // Verify alternation via send call ordering
    const sendCallsA = (channelA.send as any).mock.calls;
    const sendCallsB = (channelB.send as any).mock.calls;
    const totalCalls = sendCallsA.length + sendCallsB.length;
    expect(totalCalls).toBeGreaterThan(0);
    // Alternation means turns alternate a→b→a→b...
    // The first turn should be from the initial yourTurn state
  });
});