// bun:test timeout:15000

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { RunnerContext, AgentChannel } from "../../src/runner/types.ts";
import { getMatch, countEvents } from "../../src/persistence/match-store.ts";
import { MatchQueue } from "../../src/matchmaker/queue";
import { findPair } from "../../src/matchmaker/pair";
import { RandomAgent } from "../../src/agents/random";

function makeTempDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id          TEXT PRIMARY KEY,
      operator_a_id INTEGER NOT NULL,
      operator_b_id INTEGER NOT NULL,
      agent_a_id  INTEGER NOT NULL DEFAULT 0,
      agent_b_id  INTEGER NOT NULL DEFAULT 0,
      origin_tag  TEXT NOT NULL DEFAULT '',
      outcome     TEXT,
      created_at  INTEGER NOT NULL
    );
  `);
  return db;
}

/**
 * AgentChannel test harness — bridges the runner's send/onMessage protocol
 * to a synchronous agent.decide() call.
 *
 * Protocol per turn:
 *   1. runner calls send(state)      → stores state, immediately fires any
 *      pending onMessage callback if one is already registered
 *   2. runner calls onMessage(cb)    → stores cb, immediately fires if state
 *      is already cached (handles send-before-onMessage order)
 *
 * This ensures the callback fires exactly once per turn whenever BOTH
 * state and cb are present, in either ordering.
 *
 * Each channel tracks its own state independently.
 */
function agentChannel(agent: RandomAgent): AgentChannel {
  let _closed = false;
  let _state: Parameters<RandomAgent["decide"]>[0] | null = null;
  let _cb: ((m: unknown) => void) | null = null;

  const fire = () => {
    if (_state !== null && _cb !== null) {
      const action = agent.decide(_state);
      _cb({ action });
      _cb = null;
    }
  };

  return {
    send(frame: unknown) {
      const state = frame as Parameters<RandomAgent["decide"]>[0];
      _state = state;
      fire(); // fire immediately if a cb is already registered
    },
    onMessage(cb: (m: unknown) => void) {
      _cb = cb;
      fire(); // fire immediately if state is already cached (handles send-before-onMessage)
    },
    close() { _closed = true; },
    get closed() { return _closed; },
    set closed(v: boolean) { _closed = v; },
  } as unknown as AgentChannel;
}

describe("Runner Integration", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTempDb();
  });

  afterEach(() => {
    db.close();
  });

  it("end-to-end: two seeded agents complete a match and it persists", async () => {
    // 1. Seed two operators into the matchmaker queue
    const queue = new MatchQueue();
    queue.enqueue({ operatorId: 101, handle: "alice", elo: 1200, enqueuedAt: Date.now() });
    queue.enqueue({ operatorId: 102, handle: "bob", elo: 1200, enqueuedAt: Date.now() + 1 });

    // 2. Create a matchmaker pair
    const pair = findPair(queue, { eloTolerance: 200 });
    expect(pair).not.toBeNull();
    expect(pair!.a.operatorId).toBe(101);
    expect(pair!.b.operatorId).toBe(102);

    // 3. Create seeded agents for each side
    const agentA = new RandomAgent("agent-101", "seed-alice-42");
    const agentB = new RandomAgent("agent-102", "seed-bob-42");

    const channelA = agentChannel(agentA);
    const channelB = agentChannel(agentB);

    // 4. Invoke the runner
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "integration-test-match-1",
      ladderId: "ladder-it-1",
      a: { id: 101, name: "alice" },
      b: { id: 102, name: "bob" },
    };

    const result = await runner.start(ctx, { a: channelA, b: channelB });

    // 5. Assert match completed and persisted
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("winnerOperatorId");
    expect(result.reason).toBeOneOf(["decisive", "timeout"] as const);

    const row = getMatch(db, "integration-test-match-1");
    expect(row).not.toBeNull();
    expect(row!.operatorAId).toBe(101);
    expect(row!.operatorBId).toBe(102);
    expect(row!.originTag).toBe("ladder");
    expect(row!.outcome).not.toBeNull();

    // 6. Assert events were persisted
    const eventCount = countEvents(db, "integration-test-match-1");
    expect(eventCount).toBeGreaterThan(0);
  });

  it("end-to-end: two operators of very different ELO are not paired", () => {
    const queue = new MatchQueue();
    queue.enqueue({ operatorId: 201, handle: "pro", elo: 2000, enqueuedAt: Date.now() });
    queue.enqueue({ operatorId: 202, handle: "newbie", elo: 400, enqueuedAt: Date.now() + 1 });

    const pair = findPair(queue, { eloTolerance: 200 });
    expect(pair).toBeNull();
  });

  it("end-to-end: multiple operators pair in order of enqueue time", () => {
    const queue = new MatchQueue();
    queue.enqueue({ operatorId: 301, handle: "alice", elo: 1200, enqueuedAt: 1000 });
    queue.enqueue({ operatorId: 302, handle: "bob", elo: 1200, enqueuedAt: 1001 });
    queue.enqueue({ operatorId: 303, handle: "carol", elo: 1200, enqueuedAt: 1002 });

    const pair1 = findPair(queue, { eloTolerance: 200 });
    expect(pair1).not.toBeNull();
    // First pair should be alice+bob (earliest two in queue)
    expect(new Set([pair1!.a.operatorId, pair1!.b.operatorId])).toEqual(
      new Set([301, 302]),
    );

    // After dequeuing the first pair, carol remains alone
    queue.dequeue(pair1!.a.operatorId);
    queue.dequeue(pair1!.b.operatorId);
    const pair2 = findPair(queue, { eloTolerance: 200 });
    expect(pair2).toBeNull();
  });
});
