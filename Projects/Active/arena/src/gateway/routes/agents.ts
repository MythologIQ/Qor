import { Hono } from "hono";
import { authenticateOperator } from "../../storage/operators";
import { registerAgent, getAgentsByOperator, type Bracket } from "../../storage/agents";
import type { Context } from "hono";

const agents = new Hono();

async function requireAuth(c: Context): Promise<{ operatorId: number } | Response> {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization required" }, 401);
  }
  const token = auth.slice(7);
  const operator = authenticateOperator(token);
  if (!operator) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  return { operatorId: operator.id };
}

const VALID_BRACKETS: Bracket[] = ["scout_force", "warband", "vanguard_legion"];

agents.post("/", async (c: Context) => {
  const authResult = await requireAuth(c);
  if (authResult instanceof Response) return authResult;

  const parsed = await c.req.json();
  const { name, modelId, bracket, config } = parsed as {
    name?: string;
    modelId?: string;
    bracket?: string;
    config?: { systemPrompt?: string; params?: Record<string, unknown> };
  };

  if (!name || typeof name !== "string") return c.json({ error: "name is required" }, 400);
  if (!modelId || typeof modelId !== "string") return c.json({ error: "modelId is required" }, 400);
  if (!bracket || !VALID_BRACKETS.includes(bracket as Bracket)) {
    return c.json({ error: `bracket must be one of: ${VALID_BRACKETS.join(", ")}` }, 400);
  }

  try {
    const result = registerAgent(authResult.operatorId, name, modelId, bracket as Bracket, config ?? {});
    return c.json(
      {
        agent: {
          id: result.agent.id,
          name: result.agent.name,
          fingerprint: result.agent.fingerprint,
          model_id: result.agent.model_id,
          bracket: result.agent.bracket,
          verification: result.agent.verification,
        },
        agentToken: result.apiKey,
      },
      201,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Agent registration failed";
    return c.json({ error: msg }, 400);
  }
});

agents.get("/", async (c: Context) => {
  const authResult = await requireAuth(c);
  if (authResult instanceof Response) return authResult;

  const agentList = getAgentsByOperator(authResult.operatorId);
  return c.json({
    agents: agentList.map((a) => ({
      id: a.id,
      name: a.name,
      fingerprint: a.fingerprint,
      model_id: a.model_id,
      bracket: a.bracket,
      verification: a.verification,
      queue_eligible: a.queue_eligible === 1,
      created_at: a.created_at,
    })),
  });
});

export { agents };
