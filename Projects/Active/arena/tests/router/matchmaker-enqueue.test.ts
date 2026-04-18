import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { openDb, initDb } from "../../src/persistence/db";
import { mount } from "../../src/router";
import { createLimiter } from "../../src/identity/rate-limit";
import { matchQueue } from "../../src/matchmaker/queue";

function makeApp(): { app: Hono; db: Database } {
  const db = openDb(":memory:");
  initDb(db);
  const app = new Hono();
  mount(app, db, { limiter: createLimiter({ max: 10, windowMs: 60 * 60_000 }) });
  return { app, db };
}

async function postOperator(app: Hono, handle: string): Promise<string> {
  const res = await app.fetch(
    new Request("http://t/api/arena/operators", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ handle }),
    }),
  );
  return ((await res.json()) as { token: string }).token;
}

async function enqueue(app: Hono, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.fetch(
    new Request("http://t/api/arena/matchmaker/enqueue", {
      method: "POST",
      headers,
    }),
  );
}

describe("POST /api/arena/matchmaker/enqueue", () => {
  beforeEach(() => {
    // Reset queue between tests
    matchQueue.dequeue(0); // no-op clear
  });

  test("missing Authorization → 401", async () => {
    const { app } = makeApp();
    const res = await enqueue(app, null);
    expect(res.status).toBe(401);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe("unauthorized");
  });

  test("bogus Bearer token → 401", async () => {
    const { app } = makeApp();
    const res = await enqueue(app, "deadbeef.cafebabe");
    expect(res.status).toBe(401);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe("unauthorized");
  });

  test("valid bearer → 200 + queueSize=1", async () => {
    const { app } = makeApp();
    const token = await postOperator(app, "alice");
    const res = await enqueue(app, token);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; queueSize: number };
    expect(j.ok).toBe(true);
    expect(j.queueSize).toBe(1);
  });

  test("duplicate enqueue keeps size=1 (operator already in queue)", async () => {
    const { app } = makeApp();
    const token = await postOperator(app, "alice");
    await enqueue(app, token);
    const res = await enqueue(app, token);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; queueSize: number };
    expect(j.queueSize).toBe(1);
  });
});
