import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { seedDemoMatch, DEMO_SEED_MATCH_ID } from "../../src/persistence/seed";
import { createLimiter } from "../../src/identity/rate-limit";

function makeApp(): { app: Hono; db: Database } {
  const db = openDb(":memory:");
  initDb(db);
  const app = new Hono();
  mount(app, db, { limiter: createLimiter() });
  return { app, db };
}

describe("GET /api/arena/leaderboard", () => {
  let app: Hono;
  let db: Database;
  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    db = made.db;
  });

  test("returns 200 with an array", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/leaderboard"));
    expect(res.status).toBe(200);
    const j = await res.json() as { entries: unknown[] };
    expect(Array.isArray(j.entries)).toBe(true);
  });

  test("returns empty array when no operators exist", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/leaderboard"));
    expect(res.status).toBe(200);
    const j = await res.json() as { entries: unknown[] };
    expect(j.entries).toHaveLength(0);
  });

  test("returns entries sorted by elo descending", async () => {
    // Seed a demo match so operators exist
    seedDemoMatch(db);
    const res = await app.fetch(new Request("http://t/api/arena/leaderboard"));
    expect(res.status).toBe(200);
    const j = await res.json() as { entries: Array<{ elo: number }> };
    expect(j.entries.length).toBeGreaterThan(0);
    // Verify descending order
    for (let i = 0; i < j.entries.length - 1; i++) {
      expect(j.entries[i].elo).toBeGreaterThanOrEqual(j.entries[i + 1].elo);
    }
  });

  test("each entry has handle, elo, and matchesPlayed fields", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(new Request("http://t/api/arena/leaderboard"));
    expect(res.status).toBe(200);
    const j = await res.json() as { entries: unknown[] };
    expect(j.entries.length).toBeGreaterThan(0);
    for (const entry of j.entries) {
      const e = entry as { handle?: unknown; elo?: unknown; matchesPlayed?: unknown };
      expect(typeof e.handle).toBe("string");
      expect(typeof e.elo).toBe("number");
      expect(typeof e.matchesPlayed).toBe("number");
    }
  });

  test("limit parameter is enforced — returns at most N entries", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(new Request("http://t/api/arena/leaderboard?limit=1"));
    expect(res.status).toBe(200);
    const j = await res.json() as { entries: unknown[] };
    expect(j.entries.length).toBeLessThanOrEqual(1);
  });
});
