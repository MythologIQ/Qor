import { Hono } from "hono";

const app = new Hono();

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

app.get("/api/arena/status", (c) =>
  c.json({
    ok: true,
    service: "arena",
    version: SERVICE_VERSION,
    phase: "scaffold",
    matches_active: 0,
    matches_total: 0,
    agents_connected: 0,
    ts: new Date().toISOString(),
  }),
);

app.get("/", (c) => c.text("arena service online — awaiting engine build"));

const port = Number(process.env.PORT ?? 4200);

export default {
  port,
  fetch: app.fetch,
};

console.log(`[arena] listening on :${port}`);
