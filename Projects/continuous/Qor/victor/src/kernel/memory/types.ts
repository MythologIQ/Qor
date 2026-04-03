export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
  vectorDimensions?: number;
}

export interface EmbeddingConfig {
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
}

export interface LearningQuery {
  origin_phase?: string;
  trigger_type?: string;
  universal_truth?: boolean;
  context_node?: string;
  context_stack?: string | { $in: string[] };
  lesson?: { $regex: string };
}

export interface HeatmapUpdate {
  node: string;
  heat: number;
  reason: string;
}

export interface SourceSpan {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface DocumentInput {
  path: string;
  content: string;
  projectId: string;
}

export interface SourceDocumentRecord {
  id: string;
  path: string;
  projectId: string;
  title: string;
  contentType: string;
  fingerprint: string;
  contentLength: number;
  updatedAt: number;
}

export interface SourceChunkRecord {
  id: string;
  documentId: string;
  index: number;
  fingerprint: string;
  text: string;
  tokenEstimate: number;
  span: SourceSpan;
  embedding?: number[];
}

export interface SemanticNodeRecord {
  id: string;
  documentId: string;
  sourceChunkId: string;
  nodeType: 'Project' | 'Goal' | 'Task' | 'Decision' | 'Constraint' | 'Module' | 'Actor' | 'Dependency';
  label: string;
  summary: string;
  fingerprint: string;
  span: SourceSpan;
  attributes: Record<string, string>;
  state: 'active' | 'tombstoned';
}

export interface SemanticEdgeRecord {
  id: string;
  documentId: string;
  sourceChunkId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: 'depends-on' | 'owned-by' | 'derived-from' | 'supersedes' | 'blocks' | 'supports' | 'relates-to' | 'sourced-from';
  fingerprint: string;
  attributes: Record<string, string>;
  state: 'active' | 'tombstoned';
}

export interface CacheDependencyRef {
  kind: 'document' | 'chunk' | 'semantic-node' | 'semantic-edge';
  id: string;
}

export interface CacheEntryRecord {
  id: string;
  cacheType: 'stable-summary' | 'retrieval-bundle';
  summary: string;
  status: 'fresh' | 'stale';
  dependencyRefs: CacheDependencyRef[];
  updatedAt: number;
}

export interface IngestionRunRecord {
  id: string;
  documentId: string;
  path: string;
  fingerprint: string;
  changedChunkIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  staleCacheIds: string[];
  createdAt: number;
}

export interface DocumentSnapshot {
  document?: SourceDocumentRecord;
  chunks: SourceChunkRecord[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  cacheEntries: CacheEntryRecord[];
}

export interface IngestionPlan {
  document: SourceDocumentRecord;
  chunks: SourceChunkRecord[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  changedChunkIds: string[];
  removedChunkIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
  staleCacheIds: string[];
  ingestionRun: IngestionRunRecord;
}

export interface SearchChunkHit {
  chunk: SourceChunkRecord;
  score: number;
}

export interface GraphNeighborhood {
  nodes: SemanticNodeRecord[];
  edges: SemanticEdgeRecord[];
}

export interface ContradictionRecord {
  key: string;
  nodeIds: string[];
  summaries: string[];
}

export interface GroundedContextBundle {
  query: string;
  chunkHits: SearchChunkHit[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  cacheEntries: CacheEntryRecord[];
  contradictions: ContradictionRecord[];
  missingInformation: string[];
  recommendedNextActions: string[];
}
