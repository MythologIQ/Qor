/**
 * Search/query ops — chunk full-text, vector recall, neighborhood expansion.
 * Plus cache entry ops (fresh load + stale mark + upsert) since they pair with cache reads.
 */

import type { Session } from "neo4j-driver";
import { getDriver } from "../driver";
import { assertCanRead, assertCanWrite, type AgentContext } from "../access-policy";

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try { return await fn(session); } finally { await session.close(); }
}

function resolvePartition(_ctx: AgentContext, partition?: string): string {
  return partition ?? "shared-operational";
}

export async function searchChunks(
  params: { partition?: string; projectId: string; query: string; limit?: number },
  ctx: AgentContext,
): Promise<{ id: string; score: number; text: string }[]> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanRead(ctx, partition, "search.chunks");
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const rows = await withSession((session) =>
    session.run(
      `MATCH (c:SourceChunk) WHERE c.project_id = $projectId
         AND toLower(c.text) CONTAINS toLower($query)
       RETURN c.id AS id, c.text AS text, 1.0 AS score
       LIMIT toInteger($limit)`,
      { projectId: params.projectId, query: params.query, limit },
    ),
  );
  return rows.records.map((r) => ({
    id: r.get("id") as string,
    text: r.get("text") as string,
    score: r.get("score") as number,
  }));
}

export async function searchChunksByVector(
  params: { partition?: string; embedding: number[]; limit?: number },
  ctx: AgentContext,
): Promise<{ id: string; score: number; text: string }[]> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanRead(ctx, partition, "search.chunksByVector");
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  try {
    const rows = await withSession((session) =>
      session.run(
        `CALL db.index.vector.queryNodes('source_chunk_embedding', toInteger($limit), $embedding)
         YIELD node, score
         RETURN node.id AS id, node.text AS text, score`,
        { embedding: params.embedding, limit },
      ),
    );
    return rows.records.map((r) => ({
      id: r.get("id") as string,
      text: r.get("text") as string,
      score: r.get("score") as number,
    }));
  } catch {
    return [];
  }
}

export async function searchSemanticNodes(
  params: { partition?: string; query: string; limit?: number },
  ctx: AgentContext,
): Promise<Record<string, unknown>[]> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanRead(ctx, partition, "search.semanticNodes");
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const rows = await withSession((session) =>
    session.run(
      `MATCH (n:SemanticNode) WHERE toLower(n.label) CONTAINS toLower($query) OR toLower(n.summary) CONTAINS toLower($query)
       RETURN n LIMIT toInteger($limit)`,
      { query: params.query, limit },
    ),
  );
  return rows.records.map((r) => (r.get("n") as { properties: Record<string, unknown> }).properties);
}

export async function expandNeighborhood(
  params: { partition?: string; seedNodeIds: string[]; depth?: number },
  ctx: AgentContext,
): Promise<{ nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanRead(ctx, partition, "search.expandNeighborhood");
  const depth = Math.min(Math.max(params.depth ?? 1, 1), 3);
  const rows = await withSession((session) =>
    session.run(
      `UNWIND $seedIds AS sid
       MATCH (s:SemanticNode {id: sid})
       OPTIONAL MATCH p = (s)-[*1..${depth}]-(neighbor:SemanticNode)
       WITH collect(DISTINCT s) + collect(DISTINCT neighbor) AS nodes, collect(DISTINCT p) AS paths
       RETURN nodes, paths`,
      { seedIds: params.seedNodeIds },
    ),
  );
  const row = rows.records[0];
  return {
    nodes: ((row?.get("nodes") as { properties: Record<string, unknown> }[]) ?? [])
      .filter(Boolean).map((n) => n.properties),
    edges: [],
  };
}

export async function loadFreshCacheEntries(
  params: { partition?: string; projectId: string },
  ctx: AgentContext,
): Promise<Record<string, unknown>[]> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanRead(ctx, partition, "search.loadFreshCacheEntries");
  const rows = await withSession((session) =>
    session.run(
      `MATCH (c:CacheEntry) WHERE c.partition = $partition AND c.project_id = $projectId AND c.status = 'fresh'
       RETURN c`,
      { partition, projectId: params.projectId },
    ),
  );
  return rows.records.map((r) => (r.get("c") as { properties: Record<string, unknown> }).properties);
}

export async function upsertCacheEntries(
  params: { partition?: string; projectId: string; entries: { id: string; cacheType: string; summary: string; status: string; updatedAt: number }[] },
  ctx: AgentContext,
): Promise<{ count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.upsertCacheEntries");
  await withSession((session) =>
    session.run(
      `UNWIND $entries AS e
       MERGE (c:CacheEntry {id: e.id})
       SET c.partition = $partition, c.project_id = $projectId, c.cache_type = e.cacheType,
           c.summary = e.summary, c.status = e.status, c.updated_at = e.updatedAt`,
      { partition, projectId: params.projectId, entries: params.entries },
    ),
  );
  return { count: params.entries.length };
}

export async function markCacheEntriesStale(
  params: { partition?: string; cacheIds: string[] },
  ctx: AgentContext,
): Promise<{ count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.markCacheEntriesStale");
  await withSession((session) =>
    session.run(
      `UNWIND $cacheIds AS cid MATCH (c:CacheEntry {id: cid}) SET c.status = 'stale'`,
      { cacheIds: params.cacheIds },
    ),
  );
  return { count: params.cacheIds.length };
}

export async function appendIngestionRun(
  params: { partition?: string; run: { id: string; documentId: string; path: string; fingerprint: string; createdAt: number } },
  ctx: AgentContext,
): Promise<{ id: string }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "search.appendIngestionRun");
  const r = params.run;
  await withSession((session) =>
    session.run(
      `CREATE (run:IngestionRun {id: $id})
       SET run.partition = $partition, run.document_id = $documentId, run.path = $path,
           run.fingerprint = $fingerprint, run.created_at = $createdAt`,
      { partition, id: r.id, documentId: r.documentId, path: r.path, fingerprint: r.fingerprint, createdAt: r.createdAt },
    ),
  );
  return { id: r.id };
}

export const searchOps = {
  "search.chunks": searchChunks,
  "search.chunksByVector": searchChunksByVector,
  "search.semanticNodes": searchSemanticNodes,
  "search.expandNeighborhood": expandNeighborhood,
  "search.loadFreshCacheEntries": loadFreshCacheEntries,
  "search.appendIngestionRun": appendIngestionRun,
  "graph.upsertCacheEntries": upsertCacheEntries,
  "graph.markCacheEntriesStale": markCacheEntriesStale,
} as const;
