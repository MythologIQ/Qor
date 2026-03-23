import type { LearningPacket } from '../learning-schema';
import type {
  CacheEntryRecord,
  DocumentSnapshot,
  FailureMemoryRecord,
  HeatmapUpdate,
  IngestionRunRecord,
  LearningQuery,
  GraphNeighborhood,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
  GovernanceEventRecord,
} from './types';

// ============================================================================
// Graph Store — Graph storage and mutation operations
// ============================================================================

export interface GraphStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot>;
  upsertDocument(document: SourceDocumentRecord): Promise<void>;
  replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]): Promise<void>;
  upsertSemanticNodes(nodes: SemanticNodeRecord[]): Promise<void>;
  markSemanticNodesTombstoned(nodeIds: string[]): Promise<void>;
  upsertSemanticEdges(edges: SemanticEdgeRecord[]): Promise<void>;
  markSemanticEdgesTombstoned(edgeIds: string[]): Promise<void>;
  upsertCacheEntries(entries: CacheEntryRecord[]): Promise<void>;
  markCacheEntriesStale(cacheIds: string[]): Promise<void>;
  appendIngestionRun(run: IngestionRunRecord): Promise<void>;
  appendFailureMemory(record: FailureMemoryRecord): Promise<void>;
  listFailureMemory(projectId: string, status?: FailureMemoryRecord['remediationStatus'], limit?: number): Promise<FailureMemoryRecord[]>;
  remediateFailureMemories(
    projectId: string,
    options: {
      negativeConstraint: string;
      remediationStatus: FailureMemoryRecord['remediationStatus'];
      remediationNotes: string;
      supersededBy?: string;
    },
  ): Promise<number>;
  markNegativeConstraintSummaryStale(projectId: string): Promise<void>;
  appendGovernanceEvent(event: GovernanceEventRecord): Promise<void>;
}

// ============================================================================
// Retrieval Store — Read-only retrieval and search operations
// ============================================================================

export interface RetrievalStore {
  searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]>;
  searchChunksByVector(projectId: string, embedding: number[], limit: number): Promise<SearchChunkHit[]>;
  searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]>;
  expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood>;
  loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]>;
}

// ============================================================================
// Legacy Learning Store — Packet-based learning operations
// ============================================================================

export interface LegacyLearningStore {
  index(packet: LearningPacket): Promise<void>;
  query(criteria: LearningQuery): Promise<LearningPacket[]>;
  update(id: string, packet: LearningPacket): Promise<void>;
  updateHeatmap(update: HeatmapUpdate): Promise<void>;
}

// ============================================================================
// Learning Store — Union of all store capabilities (backward compatible)
// ============================================================================

export type LearningStore = GraphStore & RetrievalStore & LegacyLearningStore;
