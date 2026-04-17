import { Hono } from "hono";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { mount } from "./router.js";
import { serveStatic } from "./static-routes.js";
import { openDb, initDb, DEFAULT_DB_PATH } from "./persistence/db.js";

const app = new Hono();

const dbPath = process.env.ARENA_DB_PATH ?? DEFAULT_DB_PATH;
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
initDb(db);

const START_TS = Date.now();
const SERVICE_VERSION = "0.1.0";

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "arena",
    version: SERVICE_VERSION,
    uptime_ms: Date.now() - START_TS,
    ts: new Date().toISOString(),
  }),
);

mount(app, db);
serveStatic(app);

app.get("/", (c) => c.text("arena service online — awaiting engine build"));

const port = Number(process.env.PORT ?? 4200);

export default {
  port,
  fetch: app.fetch,
};

console.log(`[arena] listening on :${port}`);
