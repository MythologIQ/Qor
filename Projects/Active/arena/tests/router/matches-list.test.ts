import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { createLimiter } from "../../src/identity/rate-limit";
import { saveMatch } from "../../src/persistence/match-store";
import type { MatchRecord } from "../../src/shared/types";

function makeApp(): { app: Hono; db: Database } {
  const db = openDb(":memory:");
  initDb(db);
  const app = new Hono();
  mount(app, db, { limiter: createLimiter() });
  return { app, db };
}

function seedOperator(db: Database, handle: string): number {
  const existing = db
    .prepare("SELECT id FROM operators WHERE handle = ?")
    .get(handle) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db
    .prepare(
      `INSERT INTO operators
         (handle, handle_normalized, token_id, token_salt, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .get(handle, handle, `tok-${handle}`, Buffer.alloc(16), Buffer.alloc(32), 0) as { id: number };
  return result.id;
}

function seedAgent(db: Database, operatorId: number, fingerprint: string): number {
  const result = db
    .prepare(
      `INSERT INTO agent_versions (operator_id, fingerprint, model_id, created_at)
       VALUES (?, ?, ?, ?) RETURNING id`,
    )
    .get(operatorId, fingerprint, "test-model", 0) as { id: number };
  return result.id;
}

function seedMatchWithCreatedAt(
  db: Database,
  id: string,
  opAId: number,
  opBId: number,
  agentAId: number,
  agentBId: number,
  originTag: string,
  outcome: string | null,
  createdAt: number,
): void {
  const rec: MatchRecord = {
    id,
    operatorAId: opAId,
    operatorBId: opBId,
    agentAId,
    agentBId,
    originTag,
    outcome,
    createdAt,
  };
  saveMatch(db, rec);
}

function seedNMatches(db: Database, n: number, startCreatedAt: number): void {
  const opAId = seedOperator(db, `opA_${n}`);
  const opBId = seedOperator(db, `opB_${n}`);
  const agentAId = seedAgent(db, opAId, `fp-a-${n}`);
  const agentBId = seedAgent(db, opBId, `fp-b-${n}`);
  for (let i = 1; i <= n; i++) {
    const createdAt = startCreatedAt - i * 10_000;
    seedMatchWithCreatedAt(
      db,
      `match-${n}-${String(i).padStart(3, "0")}`,
      opAId,
      opBId,
      agentAId,
      agentBId,
      `test:seed-${n}`,
      i % 3 === 0 ? "A_wins" : i % 3 === 1 ? "B_wins" : null,
      createdAt,
    );
  }
}

describe("GET /api/arena/matches", () => {
  let app: Hono;
  let db: Database;

  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    db = made.db;
  });

  test("empty DB → returns []", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/matches"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { matches: unknown[] };
    expect(j.matches).toEqual([]);
  });

  test("seed 25 matches → returns 20 most recent by created_at DESC", async () => {
    const baseCreatedAt = 1_700_000_000;
    seedNMatches(db, 25, baseCreatedAt);

    const res = await app.fetch(new Request("http://t/api/arena/matches"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      matches: Array<{
        id: string;
        operator_a: string;
        operator_b: string;
        outcome: string | null;
        created_at: number;
      }>;
    };

    expect(j.matches.length).toBe(20);

    for (let i = 0; i < j.matches.length - 1; i++) {
      expect(j.matches[i].created_at).toBeGreaterThan(j.matches[i + 1].created_at);
    }

    expect(j.matches[0].id).toBe("match-25-001");
    expect(j.matches[19].id).toBe("match-25-020");
  });

  test("seed 25 matches with explicit limit=10 → returns 10", async () => {
    seedNMatches(db, 25, 1_700_000_000);

    const res = await app.fetch(
      new Request("http://t/api/arena/matches?limit=10"),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { matches: unknown[] };
    expect(j.matches.length).toBe(10);
  });

  test("seed 5 matches → returns all 5 (under 20 cap)", async () => {
    seedNMatches(db, 5, 1_700_000_000);

    const res = await app.fetch(new Request("http://t/api/arena/matches"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { matches: unknown[] };
    expect(j.matches.length).toBe(5);
  });
});