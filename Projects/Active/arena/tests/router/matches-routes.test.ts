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

describe("match read routes", () => {
  let app: Hono;
  let db: Database;
  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    db = made.db;
  });

  test("GET /api/arena/matches/:id unknown → 404", async () => {
    const res = await app.fetch(
      new Request("http://t/api/arena/matches/nope"),
    );
    expect(res.status).toBe(404);
  });

  test("GET /api/arena/matches/:id returns record after seed", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(
      new Request(`http://t/api/arena/matches/${DEMO_SEED_MATCH_ID}`),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      id: string;
      originTag: string;
      outcome: string | null;
    };
    expect(j.id).toBe(DEMO_SEED_MATCH_ID);
    expect(j.originTag).toBe("seed:demo-v1");
    expect(j.outcome).toBe("A_wins");
  });

  test("GET /api/arena/matches/:id/events returns 30-event array", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(
      new Request(`http://t/api/arena/matches/${DEMO_SEED_MATCH_ID}/events`),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      matchId: string;
      events: Array<{ seq: number; eventType: string }>;
    };
    expect(j.matchId).toBe(DEMO_SEED_MATCH_ID);
    expect(j.events.length).toBe(30);
    expect(j.events[0].seq).toBe(1);
    expect(j.events[29].seq).toBe(30);
  });

  test("GET /api/arena/matches/:id/events unknown → 404", async () => {
    const res = await app.fetch(
      new Request("http://t/api/arena/matches/nope/events"),
    );
    expect(res.status).toBe(404);
  });

  test("GET /api/arena/operators/:handle/matches returns match list", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(
      new Request("http://t/api/arena/operators/demo_greedy/matches"),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      matches: Array<{ id: string; eventCount: number; operatorAHandle: string }>;
    };
    expect(j.matches.length).toBe(1);
    expect(j.matches[0].id).toBe(DEMO_SEED_MATCH_ID);
    expect(j.matches[0].eventCount).toBe(30);
    expect(j.matches[0].operatorAHandle).toBe("demo_greedy");
  });

  test("GET /api/arena/operators/:handle/matches unknown handle → 404", async () => {
    const res = await app.fetch(
      new Request("http://t/api/arena/operators/does_not_exist/matches"),
    );
    expect(res.status).toBe(404);
  });

  test("operator handle lookup is case-insensitive via handle_normalized", async () => {
    seedDemoMatch(db);
    const res = await app.fetch(
      new Request("http://t/api/arena/operators/DEMO_GREEDY/matches"),
    );
    expect(res.status).toBe(200);
  });
});
