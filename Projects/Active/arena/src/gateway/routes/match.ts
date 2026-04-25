// Match Facilitation Phase 2 — Match Routes
// POST /queue · POST /launch · GET /status

import type { Context } from "hono";
import { getOperatorByToken } from "../storage/operators.js";
import { getAgentById } from "../storage/agents.js";
import {
  queueAgent,
  findOpponent,
  launchMatch,
  getQueueStatus,
} from "../orchestrator/matchmaker.js";
import { classifyBracket } from "../orchestrator/bracket.js";

const OPERATOR_KEY = process.env.ARENA_OPERATOR_KEY ?? "";

function requireOperator(c: Context): ReturnType<typeof getOperatorByToken> {
  const auth = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    c.status(401);
    return null;
  }
  const op = getOperatorByToken(m[1]);
  if (!op) {
    c.status(401);
    return null;
  }
  return op;
}

// POST /api/arena/match/queue
// Body: { agentId: number, bracket?: string }
// Uses bracket auto-classification if bracket is omitted.
export async function handleQueue(c: Context): Promise<Response> {
  const operator = requireOperator(c);
  if (!operator) return c.json({ error: "unauthorized" }, 401);

  let body: { agentId?: unknown; bracket?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const agentId = typeof body?.agentId === "number" ? body.agentId : 0;
  if (!agentId) return c.json({ error: "agentId_required" }, 400);

  const agent = getAgentById(agentId);
  if (!agent) return c.json({ error: "agent_not_found" }, 404);
  if (agent.operatorId !== operator.id) return c.json({ error: "forbidden" }, 403);

  let bracket = typeof body?.bracket === "string" ? body.bracket : "";
  if (!bracket) {
    bracket = classifyBracket({ modelId: agent.modelId });
  }

  try {
    queueAgent(agentId, bracket);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 400);
  }

  return c.json({ queued: true, bracket });
}

// POST /api/arena/match/launch
// Body: { agentId: number, bracket?: string }
// Tries findOpponent; if found, calls launchMatch and returns matchId + opponent.
export async function handleLaunch(c: Context): Promise<Response> {
  const operator = requireOperator(c);
  if (!operator) return c.json({ error: "unauthorized" }, 401);

  let body: { agentId?: unknown; bracket?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const agentId = typeof body?.agentId === "number" ? body.agentId : 0;
  if (!agentId) return c.json({ error: "agentId_required" }, 400);

  const agent = getAgentById(agentId);
  if (!agent) return c.json({ error: "agent_not_found" }, 404);
  if (agent.operatorId !== operator.id) return c.json({ error: "forbidden" }, 403);

  let bracket = typeof body?.bracket === "string" ? body.bracket : "";
  if (!bracket) {
    bracket = classifyBracket({ modelId: agent.modelId });
  }

  let opponent;
  try {
    opponent = findOpponent(agentId, bracket);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 400);
  }

  if (!opponent) return c.json({ error: "no_opponent_found" }, 409);

  let match;
  try {
    match = launchMatch(agentId, opponent.id, bracket);
  } catch (err: unknown) {
    return c.json({ error: String(err) }, 500);
  }

  return c.json({ matchId: match.id, opponent: opponent.id }, 201);
}

// GET /api/arena/match/status
// Returns queue depth for all brackets.
export async function handleStatus(c: Context): Promise<Response> {
  const status = getQueueStatus();
  return c.json({ brackets: status });
}