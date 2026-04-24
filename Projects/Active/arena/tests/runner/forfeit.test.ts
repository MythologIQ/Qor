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

function makeChannel(id: number, overrides: Partial<AgentChannel> = {}): AgentChannel {
  return {
    send: async () => {},
    dispose: () => {},
    operatorId: id,
    onClose: undefined,
    onMessage: undefined,
    closed: false,
    close() { (this as any).closed = true; },
    ...overrides,
  };
}

describe("MatchRunner forfeit", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTempDb();
  });

  afterEach(() => {
    db.close();
  });

  it("returns reason:forfeit when channel A closes mid-match", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "forfeit-a-close",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };

    const channelBclose = new (class {
      fired = false;
      closed = false;
      send = async () => {};
      dispose = () => {};
      operatorId = 20;
      closeHandler: (() => void) | undefined;
      onMessage: ((msg: unknown) => void) | undefined;
      onClose(fn: () => void) { this.closeHandler = fn; }
      close() { this.closed = true; this.fired = true; this.closeHandler?.(); }
      // B waits for message and never responds — only A closes mid-turn
      triggerClose() {
        this.fired = true;
        this.closeHandler?.();
      }
    })();

    const channelAclose = new (class {
      fired = false;
      closed = false;
      send = async () => {};
      dispose = () => {};
      operatorId = 10;
      closeHandler: (() => void) | undefined;
      onMessage: ((msg: unknown) => void) | undefined;
      onClose(fn: () => void) { this.closeHandler = fn; }
      close() { this.closed = true; this.closeHandler?.(); }
    })();

    const channels = { a: channelAclose, b: channelBclose };

    // Start match but fire close on A before first turn completes
    const startPromise = runner.start(ctx, channels);

    // Trigger channel A close before B has responded
    channelAclose.close();

    const result = await startPromise;

    expect(result.reason).toBe("forfeit");
    expect(result.winnerOperatorId).toBe(20); // B wins when A forfeits
  });

  it("returns reason:forfeit when channel B closes mid-match", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "forfeit-b-close",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };

    let closeHandlerB: (() => void) | undefined;

    const channelA = makeChannel(10, {
      onClose: (fn: () => void) => {
        /* registered but not fired */
      },
    });
    const channelB = makeChannel(20, {
      onClose: (fn: () => void) => {
        closeHandlerB = fn;
      },
    });

    const channels = { a: channelA, b: channelB };
    const startPromise = runner.start(ctx, channels);

    // Fire close on B — A should win by forfeit
    closeHandlerB?.();

    const result = await startPromise;

    expect(result.reason).toBe("forfeit");
    expect(result.winnerOperatorId).toBe(10); // A wins when B forfeits
  });

  it("persists forfeit outcome to database", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "forfeit-persist-check",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };

    let closeHandlerA: (() => void) | undefined;

    const channelA = makeChannel(10, {
      onClose: (fn: () => void) => {
        closeHandlerA = fn;
      },
    });
    const channelB = makeChannel(20);

    const channels = { a: channelA, b: channelB };
    const startPromise = runner.start(ctx, channels);

    channelA.close?.();
    await startPromise;

    const row = getMatch(db, "forfeit-persist-check");
    expect(row).not.toBeNull();
    expect(row!.outcome).not.toBeNull();
    const outcome = JSON.parse(row!.outcome!);
    expect(outcome.winnerOperatorId).toBe(20); // B wins when A forfeits
    expect(outcome.reason).toBe("forfeit");
    expect(row!.originTag).toBe("ladder");
  });

  it("completes without hanging when a channel closes immediately", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "forfeit-no-hang",
      ladderId: "ladder-1",
      a: { id: 10, name: "OpA" },
      b: { id: 20, name: "OpB" },
    };

    let closeHandlerA: (() => void) | undefined;

    const channelA = makeChannel(10, {
      onClose: (fn: () => void) => {
        closeHandlerA = fn;
      },
    });
    const channelB = makeChannel(20);

    const channels = { a: channelA, b: channelB };

    // Fire close immediately — match should terminate right away
    channelA.close?.();

    const result = await runner.start(ctx, channels);

    expect(result.reason).toBe("forfeit");
    expect(result.winnerOperatorId).toBe(20);
  });
});
