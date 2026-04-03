import {
  getAgentTimeline,
  getCrossAgentLinks,
  getEntityNetwork,
  getGraphStats,
  queryGraph,
  closeDriver,
} from "./graph-api";
import { startWatcher } from "./ingest-listener";

const PORT = parseInt(process.env.CONTINUUM_PORT ?? "4100");

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/continuum/health") {
      return Response.json({ status: "ok", ts: Date.now() });
    }

    if (path === "/api/continuum/stats") {
      const stats = await getGraphStats();
      return Response.json(stats);
    }

    if (path === "/api/continuum/timeline") {
      const agent = url.searchParams.get("agent");
      if (!agent) {
        return Response.json({ error: "agent param required" }, { status: 400 });
      }
      const since = url.searchParams.get("since");
      const rows = await getAgentTimeline(agent, since ? parseInt(since) : undefined);
      return Response.json(rows);
    }

    if (path === "/api/continuum/cross-links") {
      const a1 = url.searchParams.get("a1");
      const a2 = url.searchParams.get("a2");
      if (!a1 || !a2) {
        return Response.json({ error: "a1 and a2 params required" }, { status: 400 });
      }
      const rows = await getCrossAgentLinks(a1, a2);
      return Response.json(rows);
    }

    if (path === "/api/continuum/entity") {
      const name = url.searchParams.get("name");
      if (!name) {
        return Response.json({ error: "name param required" }, { status: 400 });
      }
      const rows = await getEntityNetwork(name);
      return Response.json(rows);
    }

    if (path === "/api/continuum/query" && req.method === "POST") {
      const body = await req.json();
      if (!body.cypher) {
        return Response.json({ error: "cypher field required" }, { status: 400 });
      }
      const rows = await queryGraph(body.cypher, body.params ?? {});
      return Response.json(rows);
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
});

startWatcher();
console.log(`Continuum API listening on port ${PORT}`);

process.on("SIGTERM", async () => {
  await closeDriver();
  server.stop();
});
