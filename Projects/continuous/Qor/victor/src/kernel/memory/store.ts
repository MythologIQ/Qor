import type { ContinuumClient } from "../../../../continuum/client";
import type { LearningPacket } from "../learning-schema";
import type {
  CacheEntryRecord,
  DocumentSnapshot,
  HeatmapUpdate,
  IngestionRunRecord,
  LearningQuery,
  GraphNeighborhood,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
} from "./types";
import { ContinuumStore } from "./continuum-store";

export interface LearningStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  index(packet: LearningPacket): Promise<void>;
  query(criteria: LearningQuery): Promise<LearningPacket[]>;
  update(id: string, packet: LearningPacket): Promise<void>;
  updateHeatmap(update: HeatmapUpdate): Promise<void>;
  loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot>;
  upsertDocument(document: SourceDocumentRecord): Promise<void>;
  replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]): Promise<void>;
  upsertSemanticNodes(nodes: SemanticNodeRecord[]): Promise<void>;
  markSemanticNodesTombstoned(nodeIds: string[]): Promise<void>;
  upsertSemanticEdges(edges: SemanticEdgeRecord[]): Promise<void>;
  markSemanticEdgesTombstoned(edgeIds: string[]): Promise<void>;
  upsertCacheEntries(projectId: string, entries: CacheEntryRecord[]): Promise<void>;
  markCacheEntriesStale(cacheIds: string[]): Promise<void>;
  appendIngestionRun(run: IngestionRunRecord): Promise<void>;
  searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]>;
  searchChunksByVector(projectId: string, embedding: number[], limit: number): Promise<SearchChunkHit[]>;
  searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]>;
  expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood>;
  loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]>;
}

export type ExecutionStatus = "completed" | "blocked" | "failed" | "quarantined";

export interface ExecutionEvent {
  readonly id: string;
  readonly agentId: string;
  readonly partition: string;
  readonly taskId: string;
  readonly phaseId?: string;
  readonly source: string;
  readonly status: ExecutionStatus;
  readonly timestamp: number;
  readonly summary?: string;
  readonly testsPassed?: number;
  readonly filesChanged?: string[];
  readonly acceptanceMet?: boolean;
  readonly verdict?: string;
}

export interface ExecutionQuery {
  readonly taskId?: string;
  readonly status?: ExecutionStatus;
  readonly sinceTimestamp?: number;
  readonly limit?: number;
}

export interface ExecutionEventStore {
  record(event: ExecutionEvent): Promise<{ id: string }>;
  queryExecutions(filter: ExecutionQuery): Promise<ExecutionEvent[]>;
}

export function createLearningStore(client: ContinuumClient): LearningStore {
  return new ContinuumStore(client);
}

export function createExecutionEventStore(client: ContinuumClient): ExecutionEventStore {
  return new ContinuumStore(client);
}
