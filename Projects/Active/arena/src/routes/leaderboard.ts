import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import { getLeaderboard } from "../rank/leaderboard";

export function mountLeaderboardRoutes(app: Hono, db: Database): void {
  app.get("/api/arena/leaderboard", (c) => {
    const raw = c.req.query("limit");
    const limit = raw ? Math.min(Math.max(parseInt(raw, 10), 1), 100) : 100;
    const entries = getLeaderboard(db, limit);
    return c.json({ entries });
  });
}
