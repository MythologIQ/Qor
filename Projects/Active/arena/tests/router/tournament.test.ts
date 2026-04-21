import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { createLimiter } from "../../src/identity/rate-limit";

function makeApp(): { app: Hono; db: Database } {
  const db = openDb(":memory:");
  initDb(db);
  const app = new Hono();
  mount(app, db, { limiter: createLimiter({ max: 10, windowMs: 60 * 60_000 }) });
  return { app, db };
}

async function createOperator(app: Hono, handle = "testop"): Promise<{ operator: { id: number }; token: string }> {
  const res = await app.fetch(
    new Request("http://t/api/arena/operators", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1" },
      body: JSON.stringify({ handle }),
    }),
  );
  return res.json() as Promise<{ operator: { id: number }; token: string }>;
}

describe("Tournament Routes", () => {
  let app: Hono;
  let db: Database;

  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    db = made.db;
  });

  it("create requires operator token (unauthorized without)", async () => {
    const res = await app.fetch(
      new Request("http://t/api/arena/tournaments?name=Tournament&startAt=1000", {
        method: "POST",
        headers: {},
      }),
    );
    expect(res.status).toBe(401);
  });

  it("create with valid operator token returns 201", async () => {
    const { token } = await createOperator(app);
    const res = await app.fetch(
      new Request("http://t/api/arena/tournaments?name=Championship&startAt=1000", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { id: number; name: string };
    expect(body.id).toBeGreaterThan(0);
    expect(body.name).toBe("Championship");
  });

  it("signup requires operator token (unauthorized without)", async () => {
    const res = await app.fetch(
      new Request("http://t/api/arena/tournaments/1/signup", {
        method: "POST",
        headers: {},
      }),
    );
    expect(res.status).toBe(401);
  });

  it("signup with valid operator token returns 201", async () => {
    // Create operator and tournament
    const { token } = await createOperator(app);
    const createRes = await app.fetch(
      new Request("http://t/api/arena/tournaments?name=SignupTest&startAt=1000", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const { id: tournamentId } = await createRes.json() as { id: number };

    // Signup
    const res = await app.fetch(
      new Request(`http://t/api/arena/tournaments/${tournamentId}/signup`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { signupId: number; tournamentId: number; operatorId: number };
    expect(body.signupId).toBeGreaterThan(0);
    expect(body.tournamentId).toBe(tournamentId);
  });

  it("GET returns tournament+signups", async () => {
    const { token } = await createOperator(app, "host");
    const createRes = await app.fetch(
      new Request("http://t/api/arena/tournaments?name=GetTest&startAt=2000", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const { id: tournamentId } = await createRes.json() as { id: number };

    // Signup two operators
    const { token: token2 } = await createOperator(app, "player2");
    await app.fetch(
      new Request(`http://t/api/arena/tournaments/${tournamentId}/signup`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    await app.fetch(
      new Request(`http://t/api/arena/tournaments/${tournamentId}/signup`, {
        method: "POST",
        headers: { authorization: `Bearer ${token2}` },
      }),
    );

    // GET
    const res = await app.fetch(new Request(`http://t/api/arena/tournaments/${tournamentId}`));
    expect(res.status).toBe(200);
    const body = await res.json() as { id: number; name: string; signups: unknown[] };
    expect(body.id).toBe(tournamentId);
    expect(body.name).toBe("GetTest");
    expect(body.signups).toHaveLength(2);
  });

  it("GET non-existent tournament returns 404", async () => {
    const res = await app.fetch(new Request("http://t/api/arena/tournaments/99999"));
    expect(res.status).toBe(404);
  });
});