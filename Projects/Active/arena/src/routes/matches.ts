import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import { getMatch, listMatchesByOperator, streamEvents, type MatchListEntry } from "../persistence/match-store";
import type { MatchEvent } from "../shared/types";

export function mountMatchRoutes(app: Hono, db: Database): void {
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

  app.get("/api/arena/matches/:id", (c) => {
    const rec = getMatch(db, c.req.param("id"));
    if (!rec) return c.json({ error: "not_found" }, 404);
    return c.json(rec);
  });

  app.get("/api/arena/matches/:id/events", (c) => {
    const id = c.req.param("id");
    const rec = getMatch(db, id);
    if (!rec) return c.json({ error: "not_found" }, 404);
    const events: MatchEvent[] = [];
    for (const ev of streamEvents(db, id)) events.push(ev);
    return c.json({ matchId: id, events });
  });

  app.get("/api/arena/matches/:id/status", (c) => {
    const matchId = c.req.param("id");
    const { getActiveRuntime } = require("../orchestrator/match-runner.js");
    const runtime = getActiveRuntime(matchId);
    if (runtime) {
      return c.json({
        state: "active",
        round: runtime.round,
        roundCap: runtime.state.roundCap,
      });
    }
    const rec = getMatch(db, matchId);
    if (!rec) return c.json({ error: "not_found" }, 404);
    return c.json({
      state: rec.outcome ? "completed" : "pending",
      round: 0,
      roundCap: 0,
    });
  });

  app.get("/api/arena/operators/:handle/matches", (c) => {
    const handle = c.req.param("handle");
    const op = db
      .prepare("SELECT id FROM operators WHERE handle_normalized = ?")
      .get(handle.toLowerCase()) as { id: number } | undefined;
    if (!op) return c.json({ error: "not_found" }, 404);
    return c.json({ matches: listMatchesByOperator(db, op.id) as MatchListEntry[] });
  });
}
