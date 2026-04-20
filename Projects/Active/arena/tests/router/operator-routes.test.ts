import { test, expect, describe, beforeEach } from "bun:test";
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

async function postOperator(
  app: Hono,
  handle: string | undefined,
  xff: string = "9.9.9.9",
): Promise<Response> {
  const body = handle === undefined ? {} : { handle };
  return app.fetch(
    new Request("http://t/api/arena/operators", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": xff },
      body: JSON.stringify(body),
    }),
  );
}

async function postAgentVersion(
  app: Hono,
  token: string | null,
  body: Record<string, unknown>,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.fetch(
    new Request("http://t/api/arena/agent-versions", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/arena/operators", () => {
  test("valid handle → 200 + operator + dotted token", async () => {
    const { app } = makeApp();
    const res = await postOperator(app, "Kevin");
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      operator: { id: number; handleNormalized: string };
      token: string;
    };
    expect(j.operator.id).toBeGreaterThan(0);
    expect(j.operator.handleNormalized).toBe("kevin");
    expect(j.token.split(".").length).toBe(2);
  });

  test("missing handle → 400 handle_required", async () => {
    const { app } = makeApp();
    const res = await postOperator(app, undefined);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "handle_required",
    );
  });

  test("duplicate handle → 409 handle_taken", async () => {
    const { app } = makeApp();
    await postOperator(app, "Alice");
    const res = await postOperator(app, "alice");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(
      "handle_taken",
    );
  });

  test("empty-after-normalization handle → 400", async () => {
    const { app } = makeApp();
    const res = await postOperator(app, "\u200b\u200b");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "handle_empty_after_normalization",
    );
  });

  test("11th request from same IP → 429 with Retry-After header", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 10; i++) {
      const r = await postOperator(app, `user${i}`, "8.8.8.8");
      expect(r.status).toBe(200);
    }
    const res = await postOperator(app, "user11", "8.8.8.8");
    expect(res.status).toBe(429);
    const retry = res.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    expect(Number(retry)).toBeGreaterThan(0);
  });

  test("different IPs have independent rate buckets", async () => {
    const { app } = makeApp();
    for (let i = 0; i < 10; i++) {
      const r = await postOperator(app, `a${i}`, "1.1.1.1");
      expect(r.status).toBe(200);
    }
    const overLimit = await postOperator(app, "a11", "1.1.1.1");
    expect(overLimit.status).toBe(429);
    const freshIp = await postOperator(app, "b1", "2.2.2.2");
    expect(freshIp.status).toBe(200);
  });

  test("malformed JSON → 400 invalid_json", async () => {
    const { app } = makeApp();
    const res = await app.fetch(
      new Request("http://t/api/arena/operators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/arena/agent-versions", () => {
  async function newOperatorToken(app: Hono, handle = "opX"): Promise<string> {
    const r = await postOperator(app, handle);
    return ((await r.json()) as { token: string }).token;
  }

  test("missing Authorization → 401", async () => {
    const { app } = makeApp();
    const res = await postAgentVersion(app, null, {
      code: "x",
      modelId: "m",
      config: "",
      promptTemplate: "",
    });
    expect(res.status).toBe(401);
  });

  test("bogus Bearer token → 401", async () => {
    const { app } = makeApp();
    const res = await postAgentVersion(app, "deadbeef.cafebabe", {
      code: "x",
      modelId: "m",
      config: "",
      promptTemplate: "",
    });
    expect(res.status).toBe(401);
  });

  test("missing modelId → 400 code_and_modelId_required", async () => {
    const { app } = makeApp();
    const token = await newOperatorToken(app);
    const res = await postAgentVersion(app, token, {
      code: "function a(){}",
      config: "",
      promptTemplate: "",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "code_and_modelId_required",
    );
  });

  test("modelId too long → 400", async () => {
    const { app } = makeApp();
    const token = await newOperatorToken(app);
    const res = await postAgentVersion(app, token, {
      code: "function a(){}",
      config: "",
      modelId: "x".repeat(129),
      promptTemplate: "",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "modelId_too_long",
    );
  });

  test("valid submission → 200 with fingerprint + agentVersionId", async () => {
    const { app } = makeApp();
    const token = await newOperatorToken(app);
    const res = await postAgentVersion(app, token, {
      code: "function move(u,h){ return u.hex === h; }",
      config: '{"aggression":0.5}',
      modelId: "claude-sonnet-4-6",
      promptTemplate: "You are an arena agent.",
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      fingerprint: string;
      similarityFlags: unknown[];
      agentVersionId: number;
      modelId: string;
    };
    expect(j.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(j.similarityFlags)).toBe(true);
    expect(j.agentVersionId).toBeGreaterThan(0);
    expect(j.modelId).toBe("claude-sonnet-4-6");
  });

  test("two submissions from same operator with same inputs produce same fingerprint", async () => {
    const { app } = makeApp();
    const token = await newOperatorToken(app);
    const body = {
      code: "function a(){ return 1; }",
      config: "{}",
      modelId: "m1",
      promptTemplate: "p",
    };
    const r1 = (await (await postAgentVersion(app, token, body)).json()) as {
      fingerprint: string;
    };
    const r2 = (await (await postAgentVersion(app, token, body)).json()) as {
      fingerprint: string;
    };
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });

  test("token rotation revokes prior token (via direct DB rotate + retry)", async () => {
    const { app, db } = makeApp();
    const token = await newOperatorToken(app, "rotator");
    // Confirm token works first.
    const ok = await postAgentVersion(app, token, {
      code: "x;",
      modelId: "m",
      config: "",
      promptTemplate: "",
    });
    expect(ok.status).toBe(200);
    // Rotate directly via DB import.
    const { rotateToken } = await import("../../src/identity/operator");
    const opRow = db
      .prepare("SELECT id FROM operators WHERE handle = ?")
      .get("rotator") as { id: number };
    const newToken = rotateToken(db, opRow.id);
    expect(newToken).not.toBe(token);
    const stale = await postAgentVersion(app, token, {
      code: "x;",
      modelId: "m",
      config: "",
      promptTemplate: "",
    });
    expect(stale.status).toBe(401);
    const fresh = await postAgentVersion(app, newToken, {
      code: "x;",
      modelId: "m",
      config: "",
      promptTemplate: "",
    });
    expect(fresh.status).toBe(200);
  });
});
