import {
  getAgentTimeline,
  getCrossAgentLinks,
  getEntityNetwork,
  getGraphStats,
  queryGraph,
  recallSimilar,
  closeDriver,
} from "./graph-api";
import { ingestAll } from "../ingest/memory-to-graph";

const PORT = parseInt(process.env.CONTINUUM_PORT ?? "4100");
const SYNC_INTERVAL = 5 * 60 * 1000;

let lastTotal = 0;
let syncing = false;

async function syncCycle() {
  if (syncing) return;
  syncing = true;
  try {
    const result = await ingestAll();
    if (result.total > lastTotal) {
      console.log(`Sync: ${result.total - lastTotal} new records (total: ${result.total})`);
    }
    lastTotal = result.total;
  } catch (err) {
    console.error(`Sync failed: ${(err as Error).message}`);
  } finally {
    syncing = false;
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/continuum/health") {
      return Response.json({ status: "ok", ts: Date.now(), lastSync: lastTotal });
    }

    if (path === "/api/continuum/stats") {
      return Response.json(await getGraphStats());
    }

    if (path === "/api/continuum/sync" && req.method === "POST") {
      await syncCycle();
      return Response.json({ total: lastTotal });
    }

    if (path === "/api/continuum/timeline") {
      const agent = url.searchParams.get("agent");
      if (!agent) {
        return Response.json({ error: "agent param required" }, { status: 400 });
      }
      const since = url.searchParams.get("since");
      return Response.json(await getAgentTimeline(agent, since ? parseInt(since) : undefined));
    }

    if (path === "/api/continuum/cross-links") {
      const a1 = url.searchParams.get("a1");
      const a2 = url.searchParams.get("a2");
      if (!a1 || !a2) {
        return Response.json({ error: "a1 and a2 params required" }, { status: 400 });
      }
      return Response.json(await getCrossAgentLinks(a1, a2));
    }

    if (path === "/api/continuum/entity") {
      const name = url.searchParams.get("name");
      if (!name) {
        return Response.json({ error: "name param required" }, { status: 400 });
      }
      return Response.json(await getEntityNetwork(name));
    }

    if (path === "/api/continuum/recall") {
      const q = url.searchParams.get("q");
      const k = parseInt(url.searchParams.get("k") ?? "10");
      if (!q) {
        return Response.json({ error: "q param required" }, { status: 400 });
      }
      return Response.json(await recallSimilar(q, k));
    }

    if (path === "/api/continuum/query" && req.method === "POST") {
      const body = await req.json();
      if (!body.cypher) {
        return Response.json({ error: "cypher field required" }, { status: 400 });
      }
      return Response.json(await queryGraph(body.cypher, body.params ?? {}));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
});

syncCycle();
setInterval(syncCycle, SYNC_INTERVAL);
console.log(`Continuum API listening on port ${PORT}`);

process.on("SIGTERM", async () => {
  await closeDriver();
  server.stop();
});
