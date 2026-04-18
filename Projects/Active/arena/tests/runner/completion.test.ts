import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { RunnerContext, AgentChannel, RunnerResult } from "../../src/runner/types.ts";
import { getMatch } from "../../src/persistence/match-store.ts";

function makeTempDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id              TEXT PRIMARY KEY,
      operator_a_id   INTEGER NOT NULL,
      operator_b_id   INTEGER NOT NULL,
      agent_a_id      INTEGER NOT NULL DEFAULT 0,
      agent_b_id      INTEGER NOT NULL DEFAULT 0,
      origin_tag      TEXT NOT NULL DEFAULT '',
      outcome         TEXT,
      created_at      INTEGER NOT NULL,
      completed_at    INTEGER
    );
  `);
  return db;
}

function fakeChannel(id: number): AgentChannel {
  return {
    send: async () => {},
    dispose: () => {},
    operatorId: id,
    closed: false,
    close() { (this as any).closed = true; },
  };
}

describe("MatchRunner completion", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTempDb();
  });

  afterEach(() => {
    db.close();
  });

  it("completed match row has winner_operator_id set (or null for draw/timeout)", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "completion-winner-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: fakeChannel(10), b: fakeChannel(20) };

    await runner.start(ctx, channels);

    const row = getMatch(db, "completion-winner-1");
    expect(row).not.toBeNull();
    expect(row!.outcome).not.toBeNull();
    const outcome = JSON.parse(row!.outcome!);
    expect(outcome).toHaveProperty("winnerOperatorId");
    // All-pass agents may time out (draw) — both outcomes are valid
    expect(
      outcome.winnerOperatorId === null ||
      typeof outcome.winnerOperatorId === "number",
    ).toBe(true);
  });

  it("completed match row has originTag='ladder'", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "completion-origin-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: fakeChannel(10), b: fakeChannel(20) };

    await runner.start(ctx, channels);

    const row = getMatch(db, "completion-origin-1");
    expect(row).not.toBeNull();
    expect(row!.originTag).toBe("ladder");
  });

  it("completed match row has created_at set", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "completion-timestamp-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };
    const channels = { a: fakeChannel(10), b: fakeChannel(20) };

    await runner.start(ctx, channels);

    const row = getMatch(db, "completion-timestamp-1");
    expect(row).not.toBeNull();
    expect(row!.createdAt).toBeDefined();
    expect(typeof row!.createdAt).toBe("number");
  });

  it("forfeit match persists outcome with winnerOperatorId", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "completion-forfeit-1",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };

    // Channel A never responds (times out → timeout forfeit), B closes mid-match
    let closeHandler: (() => void) | undefined;
    const channelA: AgentChannel = {
      send: async () => {},
      dispose: () => {},
      operatorId: 10,
      closed: false,
      onMessage: () => {},
      onClose: (fn: () => void) => { closeHandler = fn; },
    };
    const channelB: AgentChannel = {
      send: async () => {},
      dispose: () => {},
      operatorId: 20,
      closed: false,
      close() { this.closed = true; closeHandler?.(); },
      onMessage: () => {},
    };

    const channels = { a: channelA, b: channelB };

    // Close B immediately — this triggers the onClose callback which sets forfeitResult.
    // Firing A's onMessage lets the first iteration resolve so the runner can check
    // forfeitResult on the next loop start and return early.
    channelB.close();

    const result = await runner.start(ctx, channels);
    expect(result.reason).toBe("forfeit");

    const row = getMatch(db, "completion-forfeit-1");
    expect(row).not.toBeNull();
    expect(row!.outcome).not.toBeNull();
    const outcome = JSON.parse(row!.outcome!);
    expect(outcome.winnerOperatorId).toBe(10); // A wins when B forfeits
  });
});
