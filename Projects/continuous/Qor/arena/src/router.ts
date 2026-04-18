import type { Hono } from "hono";
import type { Database } from "bun:sqlite";

export function mount(app: Hono, db: Database): void {
  void db; // reserved for Phase-2 identity + Phase-3 match routes
  app.get("/api/arena/status", (c) =>
    c.json({ stub: true, path: "/api/arena/status" }),
  );

  app.get("/api/arena/matches", (c) => {
    const rows = db
      .prepare(
        `SELECT m.id, oa.handle AS operator_a, ob.handle AS operator_b,
                m.outcome, m.created_at
         FROM matches m
         JOIN operators oa ON m.operator_a_id = oa.id
         JOIN operators ob ON m.operator_b_id = ob.id
         ORDER BY m.created_at DESC
         LIMIT 50`,
      )
      .all();
    return c.json({ matches: rows });
  });

  app.get("/api/arena/match/:id", (c) =>
    c.json({ stub: true, path: "/api/arena/match/:id", id: c.req.param("id") }),
  );

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
}
