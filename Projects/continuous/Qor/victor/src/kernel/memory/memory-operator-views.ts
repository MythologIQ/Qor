import type {
  CacheEntryRecord,
  GraphNeighborhood,
  SearchChunkHit,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
} from "./types";

export interface OperatorView<T = Record<string, unknown>> {
  kind: "overview" | "node-detail" | "search-results" | "audit-trail";
  title: string;
  data: T;
}

export function renderMemoryOverview(input: {
  documents: SourceDocumentRecord[];
  chunks: SourceChunkRecord[];
  nodes: SemanticNodeRecord[];
  cacheEntries: CacheEntryRecord[];
}): OperatorView {
  return {
    kind: "overview",
    title: "Memory Overview",
    data: {
      documentCount: input.documents.length,
      chunkCount: input.chunks.length,
      nodeCount: input.nodes.length,
      activeNodeCount: input.nodes.filter((node) => node.state === "active").length,
      staleCacheCount: input.cacheEntries.filter((entry) => entry.status === "stale").length,
    },
  };
}

export function renderNodeDetail(
  nodeId: string,
  neighborhood: GraphNeighborhood,
): OperatorView {
  const node = neighborhood.nodes.find((candidate) => candidate.id === nodeId) ?? null;
  const edges = neighborhood.edges.filter(
    (edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId,
  );
  return {
    kind: "node-detail",
    title: "Memory Node Detail",
    data: {
      node,
      edges,
    },
  };
}

export function renderSearchResults(
  query: string,
  hits: SearchChunkHit[],
): OperatorView {
  return {
    kind: "search-results",
    title: `Search Results: ${query}`,
    data: {
      query,
      total: hits.length,
      hits: hits.map((hit) => ({
        chunkId: hit.chunk.id,
        documentId: hit.chunk.documentId,
        score: hit.score,
        preview: hit.chunk.text.slice(0, 160),
      })),
    },
  };
}

export function renderAuditTrail(
  nodeId: string,
  entries: Array<Record<string, unknown>>,
): OperatorView {
  return {
    kind: "audit-trail",
    title: `Audit Trail: ${nodeId}`,
    data: {
      nodeId,
      total: entries.length,
      entries,
    },
  };
}
