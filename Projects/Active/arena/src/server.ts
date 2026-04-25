import { Hono } from "hono";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { mount } from "./router.js";
import { serveStatic } from "./static-routes.js";
import { openDb, initDb, DEFAULT_DB_PATH } from "./persistence/db.js";
import { initSchema } from "./storage/db.js";
import { seedDemoMatch } from "./persistence/seed.js";
import { startMatchmaker } from "./matchmaker/loop.js";
import { MatchQueue } from "./matchmaker/queue.js";
import { PresenceTracker } from "./matchmaker/presence.js";
import { MatchmakerStatus } from "./matchmaker/status.ts";
import { MatchRunner } from "./runner/runner.js";
import type { RunnerContext, AgentChannel } from "./runner/types.js";
import { agentSessionManager } from "./gateway/session.js";
import { configureWsAuth } from "./gateway/ws.js";
import { handleSpectatorWs, matchSpectatorPath, spectatorWebSocket } from "./gateway/spectator-ws.ts";
import { register } from "./gateway/routes/register.ts";
import { agents } from "./gateway/routes/agents.ts";

const app = new Hono();

const dbPath = process.env.ARENA_DB_PATH ?? DEFAULT_DB_PATH;
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);
initDb(db);
initSchema();
configureWsAuth(db);
if (process.env.ARENA_SEED_DEMO === "1") {
  try {
    const seeded = seedDemoMatch(db);
    console.log(`[arena] demo seed: ${JSON.stringify(seeded)}`);
  } catch (err) {
    console.error(`[arena] demo seed failed:`, err);
  }
}

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

// Boot matchmaker with closure-injected queue + presence.
const matchQueue = new MatchQueue();
const presenceTracker = new PresenceTracker();
const matchmakerStatus = new MatchmakerStatus();

const runner = new MatchRunner(db);

startMatchmaker({
  queue: matchQueue,
  presence: presenceTracker,
  onPair(pair) {
    matchmakerStatus.recordPair();
    console.log(`[arena] pair matched: operator ${pair.a.operatorId} vs ${pair.b.operatorId} (elo=${pair.a.elo})`);
    // Wire onPair → MatchRunner.start() when sessions are present
    const sessionA = agentSessionManager.getSession(`op-${pair.a.operatorId}`);
    const sessionB = agentSessionManager.getSession(`op-${pair.b.operatorId}`);
    if (!sessionA || !sessionB) {
      // No active sessions for this operator pair yet — skip silently
      return;
    }
    const matchId = `match-${pair.a.operatorId}-${pair.b.operatorId}-${Date.now()}`;
    const ctx: RunnerContext = {
      matchId,
      a: { id: pair.a.operatorId, name: pair.a.handle },
      b: { id: pair.b.operatorId, name: pair.b.handle },
    };
    const channelA: AgentChannel = {
      send: () => {},
      onMessage: () => {},
      close: () => agentSessionManager.forfeit(`op-${pair.a.operatorId}`, "disconnect"),
    };
    const channelB: AgentChannel = {
      send: () => {},
      onMessage: () => {},
      close: () => agentSessionManager.forfeit(`op-${pair.b.operatorId}`, "disconnect"),
    };
    runner.start(ctx, { a: channelA, b: channelB }).catch((err) => {
      console.error(`[arena] match run failed for pair ${pair.a.operatorId} vs ${pair.b.operatorId}:`, err);
    });
  },
  intervalMs: 5000,
});

mount(app, db, { matchQueue, presence: presenceTracker, status: matchmakerStatus });
serveStatic(app);

app.get("/", (c) => c.text("arena service online — awaiting engine build"));

const port = Number(process.env.PORT ?? 4200);

export default {
  port,
  fetch(req: Request, server: unknown) {
    const matchId = matchSpectatorPath(new URL(req.url).pathname);
    if (matchId) {
      return handleSpectatorWs(req, server, matchId, { db });
    }
    return app.fetch(req);
  },
  websocket: spectatorWebSocket,
};

console.log(`[arena] listening on :${port}`);
