import type { LearningPacket } from '../learning-schema';
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
} from './types';

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
  upsertCacheEntries(entries: CacheEntryRecord[]): Promise<void>;
  markCacheEntriesStale(cacheIds: string[]): Promise<void>;
  appendIngestionRun(run: IngestionRunRecord): Promise<void>;
  searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]>;
  searchChunksByVector(projectId: string, embedding: number[], limit: number): Promise<SearchChunkHit[]>;
  searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]>;
  expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood>;
  loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]>;
}
