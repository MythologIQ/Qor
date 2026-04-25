import { Hono } from "hono";
import { getOperatorByToken, createOperator } from "../../storage/operators.js";
import { registerAgent, getAgentsByOperator, computeFingerprint } from "../../storage/agents.js";
import { randomBytes } from "node:crypto";

const router = new Hono();

function requireAuth(c: Hono.HonoRequest): { operatorId: number; apiKey: string } {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Hono.HTTPException(401, { message: "Missing or invalid Authorization header" });
  }
  const token = auth.slice(7);
  const operator = getOperatorByToken(token);
  if (!operator) {
    throw new Hono.HTTPException(401, { message: "Invalid API key" });
  }
  return { operatorId: operator.id, apiKey: token };
}

router.post("/", async (c) => {
  const { operatorId, apiKey } = requireAuth(c.req);
  const body = await c.req.json<{ name?: string; fingerprint?: string; modelId?: string }>();
  const { name, fingerprint, modelId } = body ?? {};

  if (!name || typeof name !== "string" || name.length < 2 || name.length > 48) {
    return c.json({ error: "name must be 2–48 characters" }, 400);
  }
  if (!modelId || typeof modelId !== "string") {
    return c.json({ error: "modelId is required" }, 400);
  }
  const fp = fingerprint || computeFingerprint(modelId, apiKey);

  const result = registerAgent(operatorId, name, fp, modelId);
  return c.json({ agent: result.agent, agentToken: result.apiKey }, 201);
});

router.get("/", async (c) => {
  const { operatorId } = requireAuth(c.req);
  const agents = getAgentsByOperator(operatorId);
  return c.json({ agents });
});

export default router;