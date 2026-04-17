import type { Hono } from "hono";
import type { Database } from "bun:sqlite";

export function mount(app: Hono, db: Database): void {
  void db; // reserved for Phase-2 identity + Phase-3 match routes
  app.get("/api/arena/status", (c) =>
    c.json({ stub: true, path: "/api/arena/status" }),
  );

  app.get("/api/arena/match/:id", (c) =>
    c.json({ stub: true, path: "/api/arena/match/:id", id: c.req.param("id") }),
  );

  app.post("/api/arena/match", (c) =>
    c.json({ stub: true, path: "/api/arena/match" }),
  );
}
