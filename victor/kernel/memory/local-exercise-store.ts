import type { LearningPacket } from '../learning-schema';
import type { LearningStore } from './store';
import type {
  CacheEntryRecord,
  DocumentSnapshot,
  FailureMemoryRecord,
  GovernanceEventRecord,
  GraphNeighborhood,
  HeatmapUpdate,
  IngestionRunRecord,
  LearningQuery,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
} from './types';

export class LocalExerciseStore implements LearningStore {
  private readonly documents = new Map<string, SourceDocumentRecord>();

  private readonly chunksByDocumentId = new Map<string, SourceChunkRecord[]>();

  private readonly nodesByDocumentId = new Map<string, SemanticNodeRecord[]>();

  private readonly edgesByDocumentId = new Map<string, SemanticEdgeRecord[]>();

  private readonly cacheByProjectId = new Map<string, CacheEntryRecord[]>();

  private readonly failureMemoryByProjectId = new Map<string, FailureMemoryRecord[]>();

  async initialize() {}

  async close() {}

  async index(_packet: LearningPacket) {}

  async query(_criteria: LearningQuery) { return []; }

  async update(_id: string, _packet: LearningPacket) {}

  async updateHeatmap(_update: HeatmapUpdate) {}

  async loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot> {
    const document = this.documents.get(documentId);
    return {
      document,
      chunks: [...(this.chunksByDocumentId.get(documentId) ?? [])],
      semanticNodes: [...(this.nodesByDocumentId.get(documentId) ?? [])],
      semanticEdges: [...(this.edgesByDocumentId.get(documentId) ?? [])],
      cacheEntries: document ? [...(this.cacheByProjectId.get(document.projectId) ?? [])] : [],
    };
  }

  async upsertDocument(document: SourceDocumentRecord) {
    this.documents.set(document.id, document);
  }

  async replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]) {
    this.chunksByDocumentId.set(documentId, chunks);
  }

  async upsertSemanticNodes(nodes: SemanticNodeRecord[]) {
    const byDocumentId = groupBy(nodes, (node) => node.documentId);
    for (const [documentId, nextNodes] of byDocumentId) {
      const merged = new Map((this.nodesByDocumentId.get(documentId) ?? []).map((node) => [node.id, node]));
      for (const node of nextNodes) {
        merged.set(node.id, node);
      }
      this.nodesByDocumentId.set(documentId, [...merged.values()]);
    }
  }

  async markSemanticNodesTombstoned(nodeIds: string[]) {
    if (nodeIds.length === 0) {
      return;
    }

    for (const [documentId, nodes] of this.nodesByDocumentId) {
      this.nodesByDocumentId.set(
        documentId,
        nodes.map((node) => (nodeIds.includes(node.id) ? { ...node, state: 'tombstoned' } : node)),
      );
    }
  }

  async upsertSemanticEdges(edges: SemanticEdgeRecord[]) {
    const byDocumentId = groupBy(edges, (edge) => edge.documentId);
    for (const [documentId, nextEdges] of byDocumentId) {
      const merged = new Map((this.edgesByDocumentId.get(documentId) ?? []).map((edge) => [edge.id, edge]));
      for (const edge of nextEdges) {
        merged.set(edge.id, edge);
      }
      this.edgesByDocumentId.set(documentId, [...merged.values()]);
    }
  }

  async markSemanticEdgesTombstoned(edgeIds: string[]) {
    if (edgeIds.length === 0) {
      return;
    }

    for (const [documentId, edges] of this.edgesByDocumentId) {
      this.edgesByDocumentId.set(
        documentId,
        edges.map((edge) => (edgeIds.includes(edge.id) ? { ...edge, state: 'tombstoned' } : edge)),
      );
    }
  }

  async upsertCacheEntries(entries: CacheEntryRecord[]) {
    const grouped = groupBy(entries, (entry) => this.resolveProjectIdForCache(entry));
    for (const [projectId, nextEntries] of grouped) {
      const merged = new Map((this.cacheByProjectId.get(projectId) ?? []).map((entry) => [entry.id, entry]));
      for (const entry of nextEntries) {
        merged.set(entry.id, entry);
      }
      this.cacheByProjectId.set(projectId, [...merged.values()]);
    }
  }

  async markCacheEntriesStale(cacheIds: string[]) {
    if (cacheIds.length === 0) {
      return;
    }

    for (const [projectId, entries] of this.cacheByProjectId) {
      this.cacheByProjectId.set(
        projectId,
        entries.map((entry) => (cacheIds.includes(entry.id) ? { ...entry, status: 'stale' } : entry)),
      );
    }
  }

  async appendIngestionRun(_run: IngestionRunRecord) {}

  async appendFailureMemory(record: FailureMemoryRecord) {
    const existing = this.failureMemoryByProjectId.get(record.projectId) ?? [];
    const merged = new Map(existing.map((item) => [item.id, item]));
    merged.set(record.id, record);
    this.failureMemoryByProjectId.set(record.projectId, [...merged.values()]);
  }

  async listFailureMemory(
    projectId: string,
    status?: FailureMemoryRecord['remediationStatus'],
    limit = 50,
  ): Promise<FailureMemoryRecord[]> {
    return [...(this.failureMemoryByProjectId.get(projectId) ?? [])]
      .filter((record) => !status || record.remediationStatus === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async remediateFailureMemories(
    projectId: string,
    options: {
      negativeConstraint: string;
      remediationStatus: FailureMemoryRecord['remediationStatus'];
      remediationNotes: string;
      supersededBy?: string;
    },
  ): Promise<number> {
    const existing = this.failureMemoryByProjectId.get(projectId) ?? [];
    let changed = 0;
    const now = Date.now();
    this.failureMemoryByProjectId.set(
      projectId,
      existing.map((record) => {
        if (
          record.remediationStatus !== 'UNRESOLVED'
          || record.negativeConstraint?.trim() !== options.negativeConstraint.trim()
        ) {
          return record;
        }
        changed += 1;
        return {
          ...record,
          remediationStatus: options.remediationStatus,
          remediationNotes: options.remediationNotes,
          supersededBy: options.supersededBy,
          updatedAt: now,
        };
      }),
    );
    return changed;
  }

  async appendGovernanceEvent(_event: GovernanceEventRecord) {}

  async markNegativeConstraintSummaryStale(projectId: string): Promise<void> {
    const entries = this.cacheByProjectId.get(projectId) ?? [];
    this.cacheByProjectId.set(
      projectId,
      entries.map((entry) => (
        entry.cacheType === 'negative-constraint-summary'
          ? { ...entry, status: 'stale' }
          : entry
      )),
    );
  }

  async searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]> {
    const terms = tokenize(query);

    return [...this.documents.values()]
      .filter((document) => document.projectId === projectId)
      .flatMap((document) => (
        (this.chunksByDocumentId.get(document.id) ?? []).map((chunk) => ({ chunk, document }))
      ))
      .map(({ chunk, document }) => ({
        chunk,
        score: scoreText(`${document.path} ${document.title} ${chunk.text}`, terms),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index)
      .slice(0, limit);
  }

  async searchChunksByVector(_projectId: string, _embedding: number[], _limit: number): Promise<SearchChunkHit[]> {
    return [];
  }

  async searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]> {
    const terms = tokenize(query);

    return [...this.documents.values()]
      .filter((document) => document.projectId === projectId)
      .flatMap((document) => (
        (this.nodesByDocumentId.get(document.id) ?? []).map((node) => ({ node, document }))
      ))
      .filter(({ node }) => node.state === 'active')
      .map(({ node, document }) => ({
        node,
        score: scoreText(
          `${document.path} ${document.title} ${node.label} ${node.summary} ${Object.values(node.attributes).join(' ')}`,
          terms,
        ),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
      .slice(0, limit)
      .map((hit) => hit.node);
  }

  async expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood> {
    if (seedNodeIds.length === 0 || depth <= 0) {
      return { nodes: [], edges: [] };
    }

    const activeEdges = [...this.edgesByDocumentId.values()].flat().filter((edge) => edge.state === 'active');
    const activeNodes = [...this.nodesByDocumentId.values()].flat().filter((node) => node.state === 'active');
    const nodeById = new Map(activeNodes.map((node) => [node.id, node]));
    const seenNodeIds = new Set(seedNodeIds);
    const seenEdgeIds = new Set<string>();
    const frontier = new Set(seedNodeIds);

    for (let remaining = depth; remaining > 0; remaining -= 1) {
      const nextFrontier = new Set<string>();
      for (const edge of activeEdges) {
        if (!frontier.has(edge.fromNodeId) && !frontier.has(edge.toNodeId)) {
          continue;
        }
        seenEdgeIds.add(edge.id);
        if (!seenNodeIds.has(edge.fromNodeId)) {
          seenNodeIds.add(edge.fromNodeId);
          nextFrontier.add(edge.fromNodeId);
        }
        if (!seenNodeIds.has(edge.toNodeId)) {
          seenNodeIds.add(edge.toNodeId);
          nextFrontier.add(edge.toNodeId);
        }
      }
      frontier.clear();
      for (const nodeId of nextFrontier) {
        frontier.add(nodeId);
      }
      if (frontier.size === 0) {
        break;
      }
    }

    return {
      nodes: [...seenNodeIds].map((nodeId) => nodeById.get(nodeId)).filter(Boolean) as SemanticNodeRecord[],
      edges: activeEdges.filter((edge) => seenEdgeIds.has(edge.id)),
    };
  }

  async loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]> {
    return [...(this.cacheByProjectId.get(projectId) ?? [])].filter((entry) => entry.status !== 'stale');
  }

  private resolveProjectIdForCache(entry: CacheEntryRecord): string {
    const documentRef = entry.dependencyRefs.find((ref) => ref.kind === 'document');
    if (documentRef) {
      const document = this.documents.get(documentRef.id);
      if (document) {
        return document.projectId;
      }
    }

    const failureRef = entry.dependencyRefs.find((ref) => ref.kind === 'failure-memory');
    if (failureRef) {
      for (const [projectId, records] of this.failureMemoryByProjectId) {
        if (records.some((record) => record.id === failureRef.id)) {
          return projectId;
        }
      }
    }

    return 'unknown';
  }
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function scoreText(text: string, terms: string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const values = grouped.get(key) ?? [];
    values.push(item);
    grouped.set(key, values);
  }
  return grouped;
}
