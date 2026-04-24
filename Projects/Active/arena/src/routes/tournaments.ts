import type { Database } from "bun:sqlite";
import type { Context, Hono } from "hono";
import { createTournament, signup } from "../tournament/signup";
import { requireOperator } from "./auth";

async function readTournamentBody(c: Context) {
  if (c.req.query("name") !== null) {
    return {
      name: c.req.query("name"),
      startAt: c.req.query("startAt"),
    };
  }
  return await c.req.json();
}

function parseStartAt(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseInt(value, 10);
  return 0;
}

export function mountTournamentRoutes(app: Hono, db: Database): void {
  app.post("/api/arena/tournaments", async (c) => {
    const operator = requireOperator(db, c);
    if (!operator) return c.json({ error: "unauthorized" }, 401);

    let body: { name?: unknown; startAt?: unknown };
    try {
      body = await readTournamentBody(c);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const name = typeof body.name === "string" ? body.name : "";
    const startAt = parseStartAt(body.startAt);
    if (!name) return c.json({ error: "name_required" }, 400);
    if (!startAt) return c.json({ error: "startAt_required" }, 400);

    const id = createTournament(db, name, startAt);
    return c.json({ id, name, startAt }, 201);
  });

  app.post("/api/arena/tournaments/:id/signup", (c) => {
    const operator = requireOperator(db, c);
    if (!operator) return c.json({ error: "unauthorized" }, 401);

    const tournamentId = parseInt(c.req.param("id"), 10);
    if (!tournamentId) return c.json({ error: "invalid_id" }, 400);

    const signupId = signup(db, tournamentId, operator.id);
    return c.json({ signupId, tournamentId, operatorId: operator.id }, 201);
  });

  app.get("/api/arena/tournaments/:id", (c) => {
    const tournamentId = parseInt(c.req.param("id"), 10);
    if (!tournamentId) return c.json({ error: "invalid_id" }, 400);

    const row = db
      .prepare("SELECT id, name, start_at AS startAt, status FROM tournaments WHERE id = ?")
      .get(tournamentId) as { id: number; name: string; startAt: number; status: string } | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);

    const signups = db
      .prepare(
        `SELECT ts.id, ts.operator_id, o.handle
         FROM tournament_signups ts
         JOIN operators o ON ts.operator_id = o.id
         WHERE ts.tournament_id = ?`,
      )
      .all(tournamentId);
    return c.json({ ...row, signups });
  });
}
