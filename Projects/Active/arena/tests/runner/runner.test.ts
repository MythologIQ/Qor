import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "../../src/runner/types.ts";
import { getMatch } from "../../src/persistence/match-store.ts";

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

function fakeChannel(id: number): AgentChannel {
  return {
    send: async () => ({ type: "action", action: { type: "pass" } as any }),
    dispose: () => {},
    operatorId: id,
  };
}

describe("MatchRunner", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTempDb();
  });

  afterEach(() => {
    db.close();
  });

  it("start() persists a match row", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "runner-skel-test-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: fakeChannel(10), b: fakeChannel(20) };

    await runner.start(ctx, channels);

    const row = getMatch(db, "runner-skel-test-1");
    expect(row).not.toBeNull();
    expect(row!.id).toBe("runner-skel-test-1");
    expect(row!.operatorAId).toBe(10);
    expect(row!.operatorBId).toBe(20);
  });

  it("start() returns RunnerResult with reason='timeout' placeholder", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "runner-skel-test-2",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: fakeChannel(10), b: fakeChannel(20) };

    const result: RunnerResult = await runner.start(ctx, channels);

    expect(result).toHaveProperty("reason");
    expect(result.reason).toBe("timeout");
    expect(result.winnerOperatorId).toBeNull();
  });

  it("start() emits no events before match loop is implemented", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "runner-skel-test-3",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: fakeChannel(10), b: fakeChannel(20) };

    // Skeleton contract: no event queue yet, result reflects placeholder state
    const result: RunnerResult = await runner.start(ctx, channels);
    expect(result.winnerOperatorId).toBeNull();
    expect(result.reason).toBe("timeout");
  });
});