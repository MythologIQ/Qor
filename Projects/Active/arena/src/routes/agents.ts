import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import { getOperatorByToken } from "../storage/operators";
import { registerAgent, getAgentsByOperator, computeFingerprint } from "../storage/agents";

function requireAuth(db: Database, c: Hono.HonoRequest): { operatorId: number; apiKey: string } | null {
  const auth = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const operator = getOperatorByToken(m[1]);
  if (!operator) return null;
  return { operatorId: operator.id, apiKey: m[1] };
}

export function mountAgentRoutes(app: Hono, db: Database): void {
  app.post("/api/arena/agents", async (c) => {
    const authCtx = requireAuth(db, c.req);
    if (!authCtx) return c.json({ error: "unauthorized" }, 401);

    let body: { name?: unknown; fingerprint?: unknown; modelId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const name = typeof body.name === "string" ? body.name : "";
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
    const modelId = typeof body.modelId === "string" ? body.modelId : "";

    if (!name || name.length < 2 || name.length > 48) {
      return c.json({ error: "name must be 2–48 characters" }, 400);
    }
    if (!modelId) {
      return c.json({ error: "modelId is required" }, 400);
    }
    const fp = fingerprint || computeFingerprint(modelId, authCtx.apiKey);
    const result = registerAgent(authCtx.operatorId, name, fp, modelId);
    return c.json({ agent: result.agent, agentToken: result.apiKey }, 201);
  });

  app.get("/api/arena/agents", (c) => {
    const authCtx = requireAuth(db, c.req);
    if (!authCtx) return c.json({ error: "unauthorized" }, 401);
    const agents = getAgentsByOperator(authCtx.operatorId);
    return c.json({ agents });
  });
}