import { describe, expect, test, beforeEach, vi } from "bun:test";
import { Database } from "bun:sqlite";
import { MatchRunner } from "../../src/runner/runner.ts";
import type { AgentChannel, RunnerContext } from "../../src/runner/types.ts";
import type { AgentAction } from "../../src/shared/types.ts";

function makeChannel(actions: AgentAction[]): AgentChannel {
  let i = 0;
  return {
    send: vi.fn(),
    onMessage: (cb: (msg: unknown) => void) => {
      if (i < actions.length) {
        cb({ action: actions[i++] });
      } else {
        cb({ action: { type: "pass", confidence: 1 } });
      }
    },
  };
}

describe("event recording", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    // create matches table (appendEvents auto-creates match_events)
    db.prepare(`CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY, operator_a_id INTEGER, operator_b_id INTEGER,
      agent_a_id INTEGER, agent_b_id INTEGER, origin_tag TEXT,
      outcome TEXT, created_at INTEGER
    )`).run();
  });

  test("synthetic match with 3 turns produces ≥3 events in match_events with monotonic seq", async () => {
    const actionsA: AgentAction[] = [
      { type: "pass", confidence: 1 },
      { type: "pass", confidence: 1 },
      { type: "pass", confidence: 1 },
    ];
    const actionsB: AgentAction[] = [
      { type: "pass", confidence: 1 },
      { type: "pass", confidence: 1 },
      { type: "pass", confidence: 1 },
    ];

    const chA = makeChannel(actionsA);
    const chB = makeChannel(actionsB);

    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "evt-test-match",
      a: { id: 1, handle: "opA" },
      b: { id: 2, handle: "opB" },
    };

    await runner.start(ctx, { a: chA, b: chB });

    const rows = db
      .prepare("SELECT seq, event_type FROM match_events WHERE match_id = ? ORDER BY seq")
      .all("evt-test-match") as { seq: number; event_type: string }[];

    expect(rows.length).toBeGreaterThanOrEqual(3);

    const seqs = rows.map((r) => r.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }

    const turnPayloads = rows.filter((r) => r.event_type === "turn_action");
    expect(turnPayloads.length).toBeGreaterThanOrEqual(3);
  });

  test("events cover a multi-turn match and seq starts at 0", async () => {
    const actionsA: AgentAction[] = Array.from({ length: 5 }, () => ({
      type: "pass",
      confidence: 1,
    }));
    const actionsB: AgentAction[] = Array.from({ length: 5 }, () => ({
      type: "pass",
      confidence: 1,
    }));

    const runner = new MatchRunner(db);
    const ctx: RunnerContext = {
      matchId: "evt-test-match-5turns",
      a: { id: 3, handle: "opC" },
      b: { id: 4, handle: "opD" },
    };

    await runner.start(ctx, { a: makeChannel(actionsA), b: makeChannel(actionsB) });

    const rows = db
      .prepare("SELECT seq FROM match_events WHERE match_id = ? ORDER BY seq")
      .all("evt-test-match-5turns") as { seq: number }[];

    expect(rows[0].seq).toBe(0);
    expect(rows.length).toBeGreaterThanOrEqual(5);

    const seqs = rows.map((r) => r.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe(seqs[i - 1] + 1);
    }
  });
});
