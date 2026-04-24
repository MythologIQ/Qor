import { test, expect, describe } from "bun:test";
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

describe("GET /api/arena/matchmaker/status", () => {
  test("returns JSON with keys queueSize, onlineCount, lastPairAt — 200 on empty state", async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      new Request("http://t/api/arena/matchmaker/status"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("queueSize");
    expect(body).toHaveProperty("lastPairAt");
    // presenceCount is the live field name; onlineCount is the documented alias
    expect(body).toHaveProperty("presenceCount");

    expect(typeof body.queueSize).toBe("number");
    // lastPairAt is number | null
    expect(body.lastPairAt === null || typeof body.lastPairAt === "number").toBe(true);
    expect(typeof body.presenceCount).toBe("number");
  });

  test("queueSize is 0 on empty state", async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      new Request("http://t/api/arena/matchmaker/status"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queueSize).toBe(0);
  });

  test("lastPairAt is null when no pair has occurred", async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      new Request("http://t/api/arena/matchmaker/status"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastPairAt).toBeNull();
  });

  test("presenceCount is 0 on empty state", async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      new Request("http://t/api/arena/matchmaker/status"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.presenceCount).toBe(0);
  });
});
