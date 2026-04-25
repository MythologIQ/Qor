import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import { createOperator } from "../storage/operators";
import { getOperatorByToken } from "../storage/operators";

export function mountRegisterRoutes(app: Hono, db: Database): void {
  app.post("/api/arena/register", async (c) => {
    let body: { handle?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const handle = typeof body.handle === "string" ? body.handle : "";
    if (!handle || handle.length < 3 || handle.length > 32) {
      return c.json({ error: "handle must be 3–32 characters" }, 400);
    }
    if (!/^[a-zA-Z0-9\-]+$/.test(handle)) {
      return c.json({ error: "handle must be alphanumeric + hyphens only" }, 400);
    }
    try {
      const result = createOperator(handle);
      return c.json({
        operator: { id: result.operator.id, handle: result.operator.handle },
        apiKey: result.apiKey,
      }, 201);
    } catch (err: any) {
      if (err.message?.includes("already taken")) {
        return c.json({ error: err.message }, 409);
      }
      return c.json({ error: "Internal error" }, 500);
    }
  });
}