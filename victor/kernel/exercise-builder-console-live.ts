import { loadBuilderConsoleArtifacts, resolveBuilderConsoleProjectsDir } from './memory/builder-console';
import { planArtifactIngestion } from './memory/ingest';
import { retrieveGroundedContext } from './memory/retrieve';
import type { GraphStore, LearningStore, RetrievalStore } from './memory/store';
import type {
  CacheEntryRecord,
  DocumentSnapshot,
  FailureMemoryRecord,
  GovernanceEventRecord,
  GraphNeighborhood,
  IngestionRunRecord,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
} from './memory/types';
import { hashContent } from './memory/provenance';

const BUILDER_REPO_ROOT = process.env.BUILDER_CONSOLE_REPO_ROOT
  || '/home/workspace/Projects/continuous/Zo-Qore';
const TARGET_PROJECT_ID = process.env.BUILDER_CONSOLE_TARGET_PROJECT_ID || 'builder-console';

async function main() {
  const projectsDir = process.env.BUILDER_CONSOLE_PROJECTS_DIR
    || await resolveBuilderConsoleProjectsDir(BUILDER_REPO_ROOT);

  if (!projectsDir) {
    throw new Error(`No Builder Console projects directory found under ${BUILDER_REPO_ROOT}`);
  }

  const store = new WorkspaceExerciseStore();
  const artifacts = await loadBuilderConsoleArtifacts(projectsDir, TARGET_PROJECT_ID);

  for (const artifact of artifacts) {
    const snapshot = await store.loadDocumentSnapshot(hashContent(artifact.projectId, artifact.path));
    const plan = planArtifactIngestion(
      {
        path: artifact.path,
        content: artifact.content,
        projectId: artifact.projectId,
      },
      snapshot,
    );

    await store.upsertDocument(plan.document);
    await store.replaceDocumentChunks(plan.document.id, plan.chunks);
    await store.upsertSemanticNodes(plan.semanticNodes);
    await store.markSemanticNodesTombstoned(plan.removedNodeIds);
    await store.upsertSemanticEdges(plan.semanticEdges);
    await store.markSemanticEdgesTombstoned(plan.removedEdgeIds);
    await store.upsertCacheEntries([]);
    await store.markCacheEntriesStale(plan.staleCacheIds);
    await store.appendIngestionRun(plan.ingestionRun);
  }

  const taskQuery = 'What comms tab prompt automation task exists in Builder Console?';
  const taskResult = await retrieveGroundedContext(store, TARGET_PROJECT_ID, taskQuery);
  const governanceQuery = 'What governance constraint binds Victor when operating through Builder Console?';
  const governanceResult = await retrieveGroundedContext(store, TARGET_PROJECT_ID, governanceQuery);

  const hasPromptAutomationTask = taskResult.semanticNodes.some(
    (node) => node.nodeType === 'Task' && /automate comms-tab prompt construction/i.test(node.label),
  );
  const hasBindingGovernanceDecision = governanceResult.semanticNodes.some(
    (node) => node.nodeType === 'Decision' && /governance is binding on victor/i.test(node.label),
  );

  const report = {
    projectsDir,
    artifactCount: artifacts.length,
    taskQuery,
    taskNodeLabels: taskResult.semanticNodes
      .filter((node) => node.nodeType === 'Task')
      .map((node) => ({ label: node.label, status: node.attributes.status || 'unknown' })),
    taskMissingInformation: taskResult.missingInformation,
    governanceQuery,
    governanceDecisions: governanceResult.semanticNodes
      .filter((node) => node.nodeType === 'Decision')
      .map((node) => node.label),
    governanceMissingInformation: governanceResult.missingInformation,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!hasPromptAutomationTask) {
    throw new Error('Live Builder Console exercise failed: prompt automation task was not retrieved.');
  }

  if (!hasBindingGovernanceDecision) {
    throw new Error('Live Builder Console exercise failed: binding governance decision was not retrieved.');
  }
}

class WorkspaceExerciseStore implements LearningStore {
  private readonly documents = new Map<string, SourceDocumentRecord>();

  private readonly chunksByDocumentId = new Map<string, SourceChunkRecord[]>();

  private readonly nodesByDocumentId = new Map<string, SemanticNodeRecord[]>();

  private readonly edgesByDocumentId = new Map<string, SemanticEdgeRecord[]>();

  private readonly cacheByProjectId = new Map<string, CacheEntryRecord[]>();

  async initialize() {}

  async close() {}

  async index() {}

  async query() { return []; }

  async update() {}

  async updateHeatmap() {}

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

  async appendFailureMemory(_record: FailureMemoryRecord) {}

  async remediateFailureMemories(
    _projectId: string,
    _options: {
      negativeConstraint: string;
      remediationStatus: FailureMemoryRecord['remediationStatus'];
      remediationNotes: string;
      supersededBy?: string;
    },
  ) { return 0; }

  async markNegativeConstraintSummaryStale(_projectId: string) {}

  async listFailureMemory(_projectId: string, _status?: FailureMemoryRecord['remediationStatus'], _limit?: number): Promise<FailureMemoryRecord[]> { return []; }

  async appendGovernanceEvent(_event: GovernanceEventRecord) {}

  async searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]> {
    const terms = tokenize(query);

    return [...this.documents.values()]
      .filter((document) => document.projectId === projectId)
      .flatMap((document) => (this.chunksByDocumentId.get(document.id) ?? []).map((chunk) => ({ document, chunk })))
      .map(({ chunk }) => ({
        chunk,
        score: scoreText(chunk.text, terms),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index)
      .slice(0, limit);
  }

  async searchChunksByVector(): Promise<SearchChunkHit[]> {
    return [];
  }

  async searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]> {
    const terms = tokenize(query);

    return [...this.documents.values()]
      .filter((document) => document.projectId === projectId)
      .flatMap((document) => this.nodesByDocumentId.get(document.id) ?? [])
      .filter((node) => node.state === 'active')
      .map((node) => ({
        node,
        score: scoreText(`${node.label} ${node.summary} ${Object.values(node.attributes).join(' ')}`, terms),
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
      nodes: [...seenNodeIds].map((id) => nodeById.get(id)).filter((node): node is SemanticNodeRecord => Boolean(node)),
      edges: activeEdges.filter((edge) => seenEdgeIds.has(edge.id)),
    };
  }

  async loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]> {
    return (this.cacheByProjectId.get(projectId) ?? []).filter((entry) => entry.status === 'fresh');
  }

  private resolveProjectIdForCache(entry: CacheEntryRecord): string {
    for (const ref of entry.dependencyRefs) {
      if (ref.kind !== 'document') {
        continue;
      }
      const document = this.documents.get(ref.id);
      if (document) {
        return document.projectId;
      }
    }
    return TARGET_PROJECT_ID;
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function scoreText(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
