import type { Hono } from "hono";

export function mount(app: Hono): void {
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
