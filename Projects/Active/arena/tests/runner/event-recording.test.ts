import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { AgentChannel, RunnerContext, RoundFrame } from "../../src/runner/types.ts";
import type { RoundPlan } from "../../src/shared/types.ts";

function passChannel(): AgentChannel {
  return {
    send: (_frame: RoundFrame) => {},
    receivePlan: async (): Promise<RoundPlan> => ({ bid: 0, extras: [] }),
    close: () => {},
    closed: false,
  };
}

describe("event recording", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.prepare(`CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY, operator_a_id INTEGER, operator_b_id INTEGER,
      agent_a_id INTEGER, agent_b_id INTEGER, origin_tag TEXT,
      outcome TEXT, created_at INTEGER
    )`).run();
  });

  test("synthetic match produces events in match_events with monotonic seq", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "evt-test-match",
      a: { id: 1, handle: "opA" },
      b: { id: 2, handle: "opB" },
    };

    await runner.start(ctx, { a: passChannel(), b: passChannel() });

    const rows = db
      .prepare("SELECT seq, event_type FROM match_events WHERE match_id = ? ORDER BY seq")
      .all("evt-test-match") as { seq: number; event_type: string }[];

    expect(rows.length).toBeGreaterThanOrEqual(1);

    const seqs = rows.map((r) => r.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  test("events seq starts at 0 and is contiguous", async () => {
    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "evt-test-match-contig",
      a: { id: 3, handle: "opC" },
      b: { id: 4, handle: "opD" },
    };

    await runner.start(ctx, { a: passChannel(), b: passChannel() });

    const rows = db
      .prepare("SELECT seq FROM match_events WHERE match_id = ? ORDER BY seq")
      .all("evt-test-match-contig") as { seq: number }[];

    if (rows.length > 0) {
      expect(rows[0].seq).toBe(0);
      const seqs = rows.map((r) => r.seq);
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBe(seqs[i - 1] + 1);
      }
    }
  });
});
