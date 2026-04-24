import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { createLimiter } from "../../src/identity/rate-limit";
import { matchQueue } from "../../src/matchmaker/queue";
import { presenceTracker } from "../../src/matchmaker/presence";
import { MatchmakerStatus } from "../../src/matchmaker/status";

function makeApp(): { app: Hono; db: Database } {
  const db = openDb(":memory:");
  initDb(db);
  matchQueue.clear();
  presenceTracker.reset?.();
  const status = new MatchmakerStatus();
  const app = new Hono();
  mount(app, db, { limiter: createLimiter(), status });
  return { app, db };
}

describe("GET /api/arena/status", () => {
  let app: Hono;
  let db: Database;

  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    db = made.db;
  });

  test("returns 200 always", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
  });

  test("returns all required keys", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("queueSize");
    expect(body).toHaveProperty("onlineCount");
    expect(body).toHaveProperty("matchesRun");
    expect(body).toHaveProperty("lastPairAt");
    expect(body).toHaveProperty("totalOperators");
    expect(body).toHaveProperty("totalMatches");
    expect(body).toHaveProperty("completedMatches");
    expect(body).toHaveProperty("pairsFormed");
  });

  test("queueSize is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { queueSize: unknown };
    expect(typeof body.queueSize).toBe("number");
  });

  test("onlineCount is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { onlineCount: unknown };
    expect(typeof body.onlineCount).toBe("number");
  });

  test("matchesRun is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { matchesRun: unknown };
    expect(typeof body.matchesRun).toBe("number");
  });

  test("lastPairAt is number or null", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { lastPairAt: unknown };
    expect(
      body.lastPairAt === null || typeof body.lastPairAt === "number",
    ).toBe(true);
  });

  test("totalOperators is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { totalOperators: unknown };
    expect(typeof body.totalOperators).toBe("number");
  });

  test("totalMatches is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { totalMatches: unknown };
    expect(typeof body.totalMatches).toBe("number");
  });

  test("completedMatches is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { completedMatches: unknown };
    expect(typeof body.completedMatches).toBe("number");
  });

  test("pairsFormed is a number", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as { pairsFormed: unknown };
    expect(typeof body.pairsFormed).toBe("number");
  });

  test("returns non-negative counts on empty database", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/status"));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      queueSize: number;
      onlineCount: number;
      totalOperators: number;
      totalMatches: number;
      completedMatches: number;
    };
    expect(body.queueSize).toBeGreaterThanOrEqual(0);
    expect(body.onlineCount).toBeGreaterThanOrEqual(0);
    expect(body.totalOperators).toBeGreaterThanOrEqual(0);
    expect(body.totalMatches).toBeGreaterThanOrEqual(0);
    expect(body.completedMatches).toBeGreaterThanOrEqual(0);
    expect(body.completedMatches).toBeLessThanOrEqual(body.totalMatches);
  });
});
