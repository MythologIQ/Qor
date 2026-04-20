// HexaWars Arena — Router (Plan A v2, Phase 2 adds identity routes)

import type { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { MatchQueue } from "./matchmaker/queue";
import type { PresenceTracker } from "./matchmaker/presence";
import {
  createLimiter,
  keyFromHeaders,
  type RateLimiter,
} from "./identity/rate-limit";
import {
  createOperator,
  getOperatorByToken,
  HandleCollisionError,
  EmptyHandleError,
} from "./identity/operator";
import { registerAgentVersion } from "./identity/agent-version";
import { getMatch, listMatchesByOperator, streamEvents } from "./persistence/match-store";
import { getLeaderboard } from "./rank/leaderboard";
import { matchQueue as _moduleMatchQueue } from "./matchmaker/queue";
import { presenceTracker as _modulePresenceTracker } from "./matchmaker/presence";
import { matchmakerMetrics } from "./matchmaker/metrics";
import { runnerMetrics } from "./runner/metrics";

let lastPairAt: number | null = null;

export function recordPair(): void {
  lastPairAt = Date.now();
}

export function getLastPairAt(): number | null {
  return lastPairAt;
}

export interface MountOpts {
  limiter?: RateLimiter;
  matchQueue?: MatchQueue;
  presence?: PresenceTracker;
}

export function mount(app: Hono, db: Database, opts: MountOpts = {}): void {
  const limiter = opts.limiter ?? createLimiter();
  const matchQueue = opts.matchQueue ?? _moduleMatchQueue;
  const presenceTracker = opts.presence ?? _modulePresenceTracker;

  app.get("/api/arena/status", (c) => {
    const matchCount = db
      .prepare("SELECT COUNT(*) as count FROM matches")
      .get() as { count: number };
    const operatorCount = db
      .prepare("SELECT COUNT(*) as count FROM operators")
      .get() as { count: number };
    const completedCount = db
      .prepare("SELECT COUNT(*) as count FROM matches WHERE outcome IS NOT NULL")
      .get() as { count: number };
    const mmMetrics = matchmakerMetrics.snapshot();
    const runMetrics = runnerMetrics.snapshot();
    const lastPair = getLastPairAt();
    return c.json({
      queueSize: matchQueue.size(),
      onlineCount: presenceTracker.size(),
      matchesRun: runMetrics.matchesRun,
      lastPairAt: lastPair,
      totalOperators: operatorCount.count,
      totalMatches: matchCount.count,
      completedMatches: completedCount.count,
      pairsFormed: mmMetrics.pairsFormed,
    });
  });

  app.get("/api/arena/matches", (c) => {
    const rawLimit = c.req.query("limit");
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10), 1), 100) : 20;
    const rows = db
      .prepare(
        `SELECT m.id, oa.handle AS operator_a, ob.handle AS operator_b,
                m.outcome, m.created_at
         FROM matches m
         JOIN operators oa ON m.operator_a_id = oa.id
         JOIN operators ob ON m.operator_b_id = ob.id
         ORDER BY m.created_at DESC
         LIMIT ?`,
      )
      .all(limit);
    return c.json({ matches: rows });
  });

  app.get("/api/arena/match/:id", (c) =>
    c.json({ stub: true, path: "/api/arena/match/:id", id: c.req.param("id") }),
  );

  // ── Match read surface (Plan A v2, Phase 3) ──────────────────────────

  app.get("/api/arena/matches/:id", (c) => {
    const rec = getMatch(db, c.req.param("id"));
    if (!rec) return c.json({ error: "not_found" }, 404);
    return c.json(rec);
  });

  app.get("/api/arena/matches/:id/events", (c) => {
    const id = c.req.param("id");
    const rec = getMatch(db, id);
    if (!rec) return c.json({ error: "not_found" }, 404);
    const events = [];
    for (const ev of streamEvents(db, id)) events.push(ev);
    return c.json({ matchId: id, events });
  });

  app.get("/api/arena/operators/:handle/matches", (c) => {
    const handle = c.req.param("handle");
    const op = db
      .prepare("SELECT id FROM operators WHERE handle_normalized = ?")
      .get(handle.toLowerCase()) as { id: number } | undefined;
    if (!op) return c.json({ error: "not_found" }, 404);
    return c.json({ matches: listMatchesByOperator(db, op.id) });
  });

  app.post("/api/arena/match", (c) =>
    c.json({ stub: true, path: "/api/arena/match" }),
  );

  app.get("/api/arena/metrics", (c) => {
    const matchCount = db
      .prepare("SELECT COUNT(*) as count FROM matches")
      .get() as { count: number };
    const operatorCount = db
      .prepare("SELECT COUNT(*) as count FROM operators")
      .get() as { count: number };
    const completedCount = db
      .prepare("SELECT COUNT(*) as count FROM matches WHERE outcome IS NOT NULL")
      .get() as { count: number };
    return c.json({
      totalMatches: matchCount.count,
      totalOperators: operatorCount.count,
      completedMatches: completedCount.count,
    });
  });

  // ── Leaderboard route (Phase E rank store) ─────────────────────────────

  app.get("/api/arena/leaderboard", (c) => {
    const raw = c.req.query("limit");
    const limit = raw ? Math.min(Math.max(parseInt(raw, 10), 1), 100) : 100;
    const entries = getLeaderboard(db, limit);
    return c.json({ entries });
  });

  // ── Identity routes (Plan A v2, Phase 2) ─────────────────────────────

  app.post("/api/arena/operators", async (c) => {
    const xff = c.req.header("x-forwarded-for");
    const remote = c.req.header("x-real-ip");
    const key = keyFromHeaders(xff, remote);
    const gate = limiter.check(key);
    if (!gate.ok) {
      c.header("Retry-After", String(gate.retryAfterSec));
      return c.json(
        { error: "rate_limited", retryAfterSec: gate.retryAfterSec },
        429,
      );
    }

    let body: { handle?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const handle = typeof body.handle === "string" ? body.handle : "";
    if (!handle) return c.json({ error: "handle_required" }, 400);

    try {
      const result = createOperator(db, handle);
      return c.json(result, 200);
    } catch (err) {
      if (err instanceof HandleCollisionError) {
        return c.json({ error: "handle_taken" }, 409);
      }
      if (err instanceof EmptyHandleError) {
        return c.json({ error: "handle_empty_after_normalization" }, 400);
      }
      throw err;
    }
  });

  app.post("/api/arena/agent-versions", async (c) => {
    const auth = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return c.json({ error: "unauthorized" }, 401);
    const operator = getOperatorByToken(db, m[1]);
    if (!operator) return c.json({ error: "unauthorized" }, 401);

    let body: {
      code?: unknown;
      config?: unknown;
      modelId?: unknown;
      promptTemplate?: unknown;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const code = typeof body.code === "string" ? body.code : "";
    const config = typeof body.config === "string" ? body.config : "";
    const modelId = typeof body.modelId === "string" ? body.modelId : "";
    const promptTemplate =
      typeof body.promptTemplate === "string" ? body.promptTemplate : "";
    if (!code || !modelId) {
      return c.json({ error: "code_and_modelId_required" }, 400);
    }
    if (modelId.length > 128) {
      return c.json({ error: "modelId_too_long" }, 400);
    }

    const result = registerAgentVersion(db, {
      operatorId: operator.id,
      code,
      config,
      modelId,
      promptTemplate,
    });
    return c.json(
      {
        fingerprint: result.fingerprint,
        similarityFlags: result.similarityFlags,
        agentVersionId: result.agentVersion.id,
        modelId: result.agentVersion.modelId,
      },
      200,
    );
  });

  // ── Matchmaker enqueue route (Plan A v2, Phase E) ─────────────────────

  app.post("/api/arena/matchmaker/enqueue", (c) => {
    const auth = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return c.json({ error: "unauthorized" }, 401);
    const operator = getOperatorByToken(db, m[1]);
    if (!operator) return c.json({ error: "unauthorized" }, 401);

    matchQueue.enqueue({
      operatorId: operator.id,
      handle: operator.handle,
      elo: (operator as any).elo ?? 1500,
      enqueuedAt: Date.now(),
    });

    return c.json({ ok: true, queueSize: matchQueue.size() });
  });

  app.get("/api/arena/matchmaker/status", (c) => {
    const lastPair = getLastPairAt();
    const queueSize = matchQueue.size();
    const presenceCount = presenceTracker.size();
    return c.json({
      lastPairAt: lastPair,
      queueSize,
      presenceCount,
    });
  });
}
