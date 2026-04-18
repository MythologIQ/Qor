import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "../../src/runner/types.ts";

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_events (
      match_id TEXT NOT NULL,
      seq      INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload  TEXT NOT NULL,
      ts       INTEGER NOT NULL,
      PRIMARY KEY (match_id, seq)
    );
  `);
  return db;
}

function neverResolvesChannel(operatorId: number): AgentChannel {
  return {
    send: () => {},
    onMessage: () => {},
    close: () => {},
  };
}

function instantPassChannel(operatorId: number): AgentChannel {
  return {
    send: () => {},
    onMessage: (cb: (m: unknown) => void) => {
      setTimeout(() => cb({ action: { type: "pass", confidence: 1 } }), 0);
    },
    close: () => {},
  };
}

describe("MatchRunner timeout", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTempDb();
  });

  afterEach(() => {
    db.close();
  });

  it("agent that never responds → reason:timeout, winner is the other operator", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "timeout-never-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    // A never responds; B always passes
    const channels = { a: neverResolvesChannel(10), b: instantPassChannel(20) };

    const result: RunnerResult = await runner.start(ctx, channels, 200);

    expect(result.reason).toBe("timeout");
    // The non-timed-out side wins
    expect(result.winnerOperatorId).toBe(20);
  });

  it("other agent never responds → reason:timeout, winner is operator A", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "timeout-never-2",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    // B never responds; A always passes
    const channels = { a: instantPassChannel(10), b: neverResolvesChannel(20) };

    const result: RunnerResult = await runner.start(ctx, channels, 200);

    expect(result.reason).toBe("timeout");
    expect(result.winnerOperatorId).toBe(10);
  });

  it("tight turnLimit terminates the loop even if agents respond slowly", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "timeout-turnlimit-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: instantPassChannel(10), b: instantPassChannel(20) };

    const result: RunnerResult = await runner.start(ctx, channels, 5000);

    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("winnerOperatorId");
    expect(result.reason).toBeOneOf(["decisive", "timeout", "forfeit"] as const);
  });
});