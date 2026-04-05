/** Phase 4: API route handlers for intelligence layers */

import { queryGraph } from "../service/graph-api";
import { runIncrementalDerivation, getSemanticNodes } from "./semantic-derive";
import { runBatchClustering } from "./semantic-cluster";
import { runProcedureMining, getProcedures } from "./procedural-mine";

export async function handleDeriveSemantic(): Promise<Response> {
  const result = await runIncrementalDerivation();
  return Response.json(result);
}

export async function handleClusterSemantic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? undefined;
  const result = await runBatchClustering(since);
  return Response.json(result);
}

export async function handleMineProcedures(): Promise<Response> {
  const result = await runProcedureMining();
  return Response.json(result);
}

export async function handleGetLayers(): Promise<Response> {
  const [episodic, semantic, procedural] = await Promise.all([
    queryGraph(
      `MATCH (n) WHERE n:Observation OR n:Interaction
       RETURN count(n) AS count,
              max(n.timestamp) AS latest`
    ),
    queryGraph(
      `MATCH (s:Semantic)
       RETURN count(s) AS total,
              sum(CASE WHEN s.subtype = 'co-occurrence' THEN 1 ELSE 0 END) AS cooc,
              sum(CASE WHEN s.subtype = 'cluster' THEN 1 ELSE 0 END) AS clusters,
              max(s.lastSeen) AS latest`
    ),
    queryGraph(
      `MATCH (p:Procedural)
       RETURN count(p) AS total,
              sum(CASE WHEN p.status = 'candidate' THEN 1 ELSE 0 END) AS candidates,
              sum(CASE WHEN p.status = 'validated' THEN 1 ELSE 0 END) AS validated,
              max(p.lastSeen) AS latest`
    ),
  ]);

  return Response.json({
    episodic: {
      count: (episodic[0]?.count as number) ?? 0,
      latest: episodic[0]?.latest ?? null,
    },
    semantic: {
      count: (semantic[0]?.total as number) ?? 0,
      coOccurrence: (semantic[0]?.cooc as number) ?? 0,
      clusters: (semantic[0]?.clusters as number) ?? 0,
      latest: semantic[0]?.latest ?? null,
    },
    procedural: {
      count: (procedural[0]?.total as number) ?? 0,
      candidates: (procedural[0]?.candidates as number) ?? 0,
      validated: (procedural[0]?.validated as number) ?? 0,
      latest: procedural[0]?.latest ?? null,
    },
  });
}

export async function handleGetSemantic(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const subtype = url.searchParams.get("subtype") ?? undefined;
  const nodes = await getSemanticNodes(limit, subtype);
  return Response.json(nodes);
}

export async function handleGetProcedural(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";
  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const nodes = await getProcedures(status, limit);
  return Response.json(nodes);
}
