import {
  getAgentTimeline,
  getCrossAgentLinks,
  getEntityNetwork,
  getGraphStats,
  queryGraph,
  recallSimilar,
} from "./graph-api";
import { getDriver, closeDriver } from "../memory/driver";
import { initializeSchema } from "../memory/schema";
import { startIpcServer, type IpcServerHandle } from "../ipc/server";
import { ingestAll } from "../ingest/memory-to-graph";
import {
  handleDeriveSemantic,
  handleClusterSemantic,
  handleMineProcedures,
  handleGetLayers,
  handleGetSemantic,
  handleGetProcedural,
} from "../derive/layer-routes";
import { materializeEvidenceBundle } from "./evidence-bundle";
import { route } from "./router";
import { readdir } from "fs/promises";
import { join } from "path";

const TMP_HEARTBEAT = "/tmp/victor-heartbeat";
const PERSIST_HEARTBEAT = "/home/workspace/Projects/continuous/Qor/victor/.heartbeat";

async function persistHeartbeat() {
  try {
    const files = await readdir(TMP_HEARTBEAT);
    for (const f of files) {
      if (f.endsWith(".json")) {
        await Bun.write(join(PERSIST_HEARTBEAT, f), Bun.file(join(TMP_HEARTBEAT, f)));
      }
    }
  } catch (err) {
    console.error("heartbeat persist failed:", (err as Error).message);
  }
}

const PORT = parseInt(process.env.QOR_PORT ?? process.env.CONTINUUM_PORT ?? "4100");
const SYNC_INTERVAL = 5 * 60 * 1000;

let lastTotal = 0;
let syncing = false;

async function syncCycle() {
  if (syncing) return;
  syncing = true;
  try {
    const result = await ingestAll();
    if (result.total > lastTotal) {
      process.stdout.write(`Sync: ${result.total - lastTotal} new records (total: ${result.total})\n`);
    }
    lastTotal = result.total;
    await persistHeartbeat();
  } catch (err) {
    console.error(`Sync failed: ${(err as Error).message}`);
  } finally {
    syncing = false;
  }
}

async function handleGraphRoutes(path: string, url: URL, req: Request): Promise<Response | null> {
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
    if (!agent) return Response.json({ error: "agent param required" }, { status: 400 });
    const since = url.searchParams.get("since");
    return Response.json(await getAgentTimeline(agent, since ? parseInt(since) : undefined));
  }
  if (path === "/api/continuum/cross-links") {
    const a1 = url.searchParams.get("a1"), a2 = url.searchParams.get("a2");
    if (!a1 || !a2) return Response.json({ error: "a1 and a2 params required" }, { status: 400 });
    return Response.json(await getCrossAgentLinks(a1, a2));
  }
  if (path === "/api/continuum/entity") {
    const name = url.searchParams.get("name");
    if (!name) return Response.json({ error: "name param required" }, { status: 400 });
    return Response.json(await getEntityNetwork(name));
  }
  if (path === "/api/continuum/recall") {
    const q = url.searchParams.get("q"), k = parseInt(url.searchParams.get("k") ?? "10");
    if (!q) return Response.json({ error: "q param required" }, { status: 400 });
    return Response.json(await recallSimilar(q, k));
  }
  if (path === "/api/continuum/query" && req.method === "POST") {
    const body = await req.json();
    if (!body.cypher) return Response.json({ error: "cypher field required" }, { status: 400 });
    return Response.json(await queryGraph(body.cypher, body.params ?? {}));
  }
  if (path === "/api/continuum/evidence-bundle" && req.method === "POST") {
    const body = await req.json();
    if (!body.sessionId || !body.intentId || !Array.isArray(body.entries)) {
      return Response.json({ error: "sessionId, intentId, and entries are required" }, { status: 400 });
    }
    return Response.json(materializeEvidenceBundle(body));
  }
  return null;
}

async function handleLayerRoutes(path: string, req: Request): Promise<Response | null> {
  if (path === "/api/continuum/derive-semantic" && req.method === "POST") return handleDeriveSemantic();
  if (path === "/api/continuum/cluster-semantic" && req.method === "POST") return handleClusterSemantic(req);
  if (path === "/api/continuum/mine-procedures" && req.method === "POST") return handleMineProcedures();
  if (path === "/api/continuum/layers") return handleGetLayers();
  if (path === "/api/continuum/semantic") return handleGetSemantic(req);
  if (path === "/api/continuum/procedural") return handleGetProcedural(req);
  return null;
}

await initializeSchema(getDriver());

let ipcHandle: IpcServerHandle | null = null;
const IPC_TRANSPORT = process.env.CONTINUUM_IPC_TRANSPORT;
const IPC_TOKEN_MAP = process.env.CONTINUUM_IPC_TOKEN_MAP;
if (IPC_TRANSPORT && IPC_TOKEN_MAP) {
  ipcHandle = await startIpcServer({ transport: IPC_TRANSPORT, tokenMapPath: IPC_TOKEN_MAP });
  process.stdout.write(`Continuum IPC listening on ${ipcHandle.socketPath}\n`);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    return route(req, handleGraphRoutes, handleLayerRoutes);
  },
});

syncCycle();
setInterval(syncCycle, SYNC_INTERVAL);
process.stdout.write(`QOR Service listening on port ${PORT}\n`);

process.on("SIGTERM", async () => {
  if (ipcHandle) await ipcHandle.stop();
  await closeDriver();
  server.stop();
});
