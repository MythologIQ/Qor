import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import {
  seedDemoMatch,
  DEMO_SEED_MATCH_ID,
} from "../../src/persistence/seed";
import { getMatch, countEvents } from "../../src/persistence/match-store";

describe("demo seed fixture", () => {
  let db: Database;
  beforeEach(() => {
    db = openDb(":memory:");
    initDb(db);
  });

  test("first call inserts 2 operators, 2 agents, 1 match, 30 events", () => {
    const r = seedDemoMatch(db);
    expect(r.alreadySeeded).toBe(false);
    expect(r.matchId).toBe(DEMO_SEED_MATCH_ID);
    expect(r.eventCount).toBe(30);

    const ops = db.prepare("SELECT COUNT(*) AS n FROM operators").get() as {
      n: number;
    };
    const avs = db
      .prepare("SELECT COUNT(*) AS n FROM agent_versions")
      .get() as { n: number };
    const ms = db.prepare("SELECT COUNT(*) AS n FROM matches").get() as {
      n: number;
    };
    expect(ops.n).toBe(2);
    expect(avs.n).toBe(2);
    expect(ms.n).toBe(1);
    expect(countEvents(db, DEMO_SEED_MATCH_ID)).toBe(30);
  });

  test("second call is idempotent: alreadySeeded=true, no duplicate rows", () => {
    seedDemoMatch(db);
    const r2 = seedDemoMatch(db);
    expect(r2.alreadySeeded).toBe(true);
    expect(r2.eventCount).toBe(30);
    const ops = db.prepare("SELECT COUNT(*) AS n FROM operators").get() as {
      n: number;
    };
    expect(ops.n).toBe(2);
  });

  test("origin_tag is seed:demo-v1 and outcome is set", () => {
    seedDemoMatch(db);
    const m = getMatch(db, DEMO_SEED_MATCH_ID);
    expect(m).not.toBeNull();
    expect(m!.originTag).toBe("seed:demo-v1");
    expect(m!.outcome).toBe("A_wins");
  });

  test("event seq values are 1..30 with no gaps", () => {
    seedDemoMatch(db);
    const rows = db
      .prepare(
        "SELECT seq FROM match_events WHERE match_id = ? ORDER BY seq ASC",
      )
      .all(DEMO_SEED_MATCH_ID) as Array<{ seq: number }>;
    expect(rows.length).toBe(30);
    for (let i = 0; i < rows.length; i++) expect(rows[i].seq).toBe(i + 1);
  });

  test("seeded operators have expected handles", () => {
    seedDemoMatch(db);
    const handles = db
      .prepare("SELECT handle FROM operators ORDER BY handle ASC")
      .all() as Array<{ handle: string }>;
    expect(handles.map((r) => r.handle)).toEqual([
      "demo_greedy",
      "demo_random",
    ]);
  });

  test("seeded agents have builtin modelIds", () => {
    seedDemoMatch(db);
    const models = db
      .prepare("SELECT model_id FROM agent_versions ORDER BY model_id ASC")
      .all() as Array<{ model_id: string }>;
    expect(models.map((r) => r.model_id)).toEqual([
      "builtin-greedy-v1",
      "builtin-random-v1",
    ]);
  });
});
