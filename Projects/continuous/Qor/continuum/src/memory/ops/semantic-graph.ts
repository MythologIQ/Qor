/**
 * Semantic graph ops — orchestration over semantic-helpers Cypher builders.
 * Each op opens a session, runs the builder's Cypher, closes.
 */

import type { Session } from "neo4j-driver";
import { getDriver } from "../driver";
import { assertCanRead, assertCanWrite, type AgentContext } from "../access-policy";
import {
  buildUpsertSemanticNodesCypher,
  buildUpsertSemanticEdgesCypher,
  buildTombstoneCypher,
  buildEdgeTombstoneCypher,
  type SemanticEdgeInput,
  type SemanticNodeInput,
} from "./semantic-helpers";

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try { return await fn(session); } finally { await session.close(); }
}

function resolvePartition(ctx: AgentContext, partition: string | undefined): string {
  return partition ?? "shared-operational";
}

export async function upsertDocument(
  params: { partition?: string; document: { id: string; path: string; projectId: string; title: string; contentType: string; fingerprint: string; contentLength: number; updatedAt: number } },
  ctx: AgentContext,
): Promise<{ id: string }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.upsertDocument");
  const d = params.document;
  await withSession((session) =>
    session.run(
      `MERGE (doc:SourceDocument {id: $id})
       SET doc.partition = $partition, doc.path = $path, doc.project_id = $projectId,
           doc.title = $title, doc.content_type = $contentType, doc.fingerprint = $fingerprint,
           doc.content_length = $contentLength, doc.updated_at = $updatedAt`,
      { partition, ...d },
    ),
  );
  return { id: d.id };
}

export async function replaceDocumentChunks(
  params: { partition?: string; documentId: string; chunks: { id: string; index: number; fingerprint: string; text: string; tokenEstimate: number; span: { startLine: number; endLine: number; startOffset: number; endOffset: number }; embedding?: number[] }[] },
  ctx: AgentContext,
): Promise<{ documentId: string; count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.replaceDocumentChunks");
  await withSession(async (session) => {
    await session.run(
      `MATCH (doc:SourceDocument {id: $documentId})-[:HAS_CHUNK]->(c:SourceChunk)
       DETACH DELETE c`,
      { documentId: params.documentId },
    );
    await session.run(
      `MATCH (doc:SourceDocument {id: $documentId})
       UNWIND $chunks AS ch
       CREATE (c:SourceChunk {id: ch.id})
       SET c.partition = $partition, c.document_id = $documentId, c.index = ch.index,
           c.fingerprint = ch.fingerprint, c.text = ch.text, c.token_estimate = ch.tokenEstimate,
           c.span = ch.span, c.embedding = ch.embedding
       MERGE (doc)-[:HAS_CHUNK]->(c)`,
      { documentId: params.documentId, partition, chunks: params.chunks },
    );
  });
  return { documentId: params.documentId, count: params.chunks.length };
}

export async function loadDocumentSnapshot(
  params: { partition?: string; documentId: string },
  ctx: AgentContext,
): Promise<{ documentId: string; chunks: Record<string, unknown>[]; nodes: Record<string, unknown>[] }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanRead(ctx, partition, "graph.loadDocumentSnapshot");
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (doc:SourceDocument {id: $documentId})
       OPTIONAL MATCH (doc)-[:HAS_CHUNK]->(c:SourceChunk)
       OPTIONAL MATCH (n:SemanticNode {document_id: $documentId})
       RETURN collect(DISTINCT c {.*}) AS chunks, collect(DISTINCT n {.*}) AS nodes`,
      { documentId: params.documentId },
    );
    const row = result.records[0];
    return {
      documentId: params.documentId,
      chunks: (row?.get("chunks") as Record<string, unknown>[]) ?? [],
      nodes: (row?.get("nodes") as Record<string, unknown>[]) ?? [],
    };
  });
}

export async function upsertSemanticNodes(
  params: { partition?: string; nodes: SemanticNodeInput[] },
  ctx: AgentContext,
): Promise<{ count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.upsertSemanticNodes");
  if (params.nodes.length === 0) return { count: 0 };
  const spec = buildUpsertSemanticNodesCypher(partition, params.nodes);
  await withSession((session) => session.run(spec.cypher, spec.params));
  return { count: params.nodes.length };
}

export async function markSemanticNodesTombstoned(
  params: { partition?: string; nodeIds: string[] },
  ctx: AgentContext,
): Promise<{ count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.markSemanticNodesTombstoned");
  if (params.nodeIds.length === 0) return { count: 0 };
  const spec = buildTombstoneCypher(partition, params.nodeIds);
  await withSession((session) => session.run(spec.cypher, spec.params));
  return { count: params.nodeIds.length };
}

export async function upsertSemanticEdges(
  params: { partition?: string; edges: SemanticEdgeInput[] },
  ctx: AgentContext,
): Promise<{ count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.upsertSemanticEdges");
  if (params.edges.length === 0) return { count: 0 };
  const spec = buildUpsertSemanticEdgesCypher(partition, params.edges);
  await withSession((session) => session.run(spec.cypher, spec.params));
  return { count: params.edges.length };
}

export async function markSemanticEdgesTombstoned(
  params: { partition?: string; edgeIds: string[] },
  ctx: AgentContext,
): Promise<{ count: number }> {
  const partition = resolvePartition(ctx, params.partition);
  assertCanWrite(ctx, partition, "graph.markSemanticEdgesTombstoned");
  if (params.edgeIds.length === 0) return { count: 0 };
  const spec = buildEdgeTombstoneCypher(partition, params.edgeIds);
  await withSession((session) => session.run(spec.cypher, spec.params));
  return { count: params.edgeIds.length };
}

export const semanticGraphOps = {
  "graph.upsertDocument": upsertDocument,
  "graph.replaceDocumentChunks": replaceDocumentChunks,
  "graph.loadDocumentSnapshot": loadDocumentSnapshot,
  "graph.upsertSemanticNodes": upsertSemanticNodes,
  "graph.markSemanticNodesTombstoned": markSemanticNodesTombstoned,
  "graph.upsertSemanticEdges": upsertSemanticEdges,
  "graph.markSemanticEdgesTombstoned": markSemanticEdgesTombstoned,
} as const;
