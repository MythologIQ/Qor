/**
 * Continuum-backed store. Transport adapter over ContinuumClient (IPC).
 * Every method is a one-line delegator to a named memory op.
 * No business logic, no caching, no state beyond the client handle.
 */

import type { ContinuumClient } from "../../../../continuum/client";
import type { LearningPacket } from "../learning-schema";
import type {
  CacheEntryRecord,
  DocumentSnapshot,
  GraphNeighborhood,
  HeatmapUpdate,
  IngestionRunRecord,
  LearningQuery,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
} from "./types";
import type {
  ExecutionEvent,
  ExecutionEventStore,
  ExecutionQuery,
  LearningStore,
} from "./store";

export class ContinuumStore implements LearningStore, ExecutionEventStore {
  constructor(private readonly client: ContinuumClient) {}

  initialize(): Promise<void> { return this.client.call("events.initialize", {}) as Promise<void>; }
  close(): Promise<void> { return this.client.close(); }

  index(packet: LearningPacket): Promise<void> { return this.client.call("events.index", { packet }) as Promise<void>; }
  query(criteria: LearningQuery): Promise<LearningPacket[]> { return this.client.call("events.query", { filter: criteria }) as Promise<LearningPacket[]>; }
  update(id: string, packet: LearningPacket): Promise<void> { return this.client.call("events.update", { id, packet }) as Promise<void>; }
  updateHeatmap(update: HeatmapUpdate): Promise<void> { return this.client.call("events.updateHeatmap", { update }) as Promise<void>; }

  loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot> { return this.client.call("graph.loadDocumentSnapshot", { documentId }) as Promise<DocumentSnapshot>; }
  upsertDocument(document: SourceDocumentRecord): Promise<void> { return this.client.call("graph.upsertDocument", { document }) as Promise<void>; }
  replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]): Promise<void> { return this.client.call("graph.replaceDocumentChunks", { documentId, chunks }) as Promise<void>; }
  upsertSemanticNodes(nodes: SemanticNodeRecord[]): Promise<void> { return this.client.call("graph.upsertSemanticNodes", { nodes }) as Promise<void>; }
  markSemanticNodesTombstoned(nodeIds: string[]): Promise<void> { return this.client.call("graph.markSemanticNodesTombstoned", { nodeIds }) as Promise<void>; }
  upsertSemanticEdges(edges: SemanticEdgeRecord[]): Promise<void> { return this.client.call("graph.upsertSemanticEdges", { edges }) as Promise<void>; }
  markSemanticEdgesTombstoned(edgeIds: string[]): Promise<void> { return this.client.call("graph.markSemanticEdgesTombstoned", { edgeIds }) as Promise<void>; }
  upsertCacheEntries(projectId: string, entries: CacheEntryRecord[]): Promise<void> { return this.client.call("graph.upsertCacheEntries", { projectId, entries }) as Promise<void>; }
  markCacheEntriesStale(cacheIds: string[]): Promise<void> { return this.client.call("graph.markCacheEntriesStale", { cacheIds }) as Promise<void>; }

  appendIngestionRun(run: IngestionRunRecord): Promise<void> { return this.client.call("search.appendIngestionRun", { run }) as Promise<void>; }
  searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]> { return this.client.call("search.chunks", { projectId, query, limit }) as Promise<SearchChunkHit[]>; }
  searchChunksByVector(projectId: string, embedding: number[], limit: number): Promise<SearchChunkHit[]> { return this.client.call("search.chunksByVector", { projectId, embedding, limit }) as Promise<SearchChunkHit[]>; }
  searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]> { return this.client.call("search.semanticNodes", { projectId, query, limit }) as Promise<SemanticNodeRecord[]>; }
  expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood> { return this.client.call("search.expandNeighborhood", { seedNodeIds, depth }) as Promise<GraphNeighborhood>; }
  loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]> { return this.client.call("search.loadFreshCacheEntries", { projectId }) as Promise<CacheEntryRecord[]>; }

  record(event: ExecutionEvent): Promise<{ id: string }> { return this.client.call("events.execution.record", { event }) as Promise<{ id: string }>; }
  queryExecutions(filter: ExecutionQuery): Promise<ExecutionEvent[]> { return this.client.call("events.execution.query", { filter }) as Promise<ExecutionEvent[]>; }
}
