import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';

import { loadBuilderConsoleArtifacts } from './memory/builder-console';
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

export async function createWorkspaceGroundedQuery(projectsDir: string, targetProjectId: string) {
  const store = new WorkspaceExerciseStore();
  const builderArtifacts = (await loadBuilderConsoleArtifacts(projectsDir, targetProjectId))
    .filter((artifact) => WORKSPACE_GROUNDED_SOURCE_KINDS.has(artifact.sourceKind));
  const workspaceArtifacts = await loadWorkspaceArtifacts(projectsDir, targetProjectId);
  const artifacts = [...builderArtifacts, ...workspaceArtifacts];

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

  return async (projectId: string, query: string) => retrieveGroundedContext(store, projectId, query);
}

async function loadWorkspaceArtifacts(projectsDir: string, targetProjectId: string) {
  const repoRoot = dirname(dirname(projectsDir));
  const files = await collectWorkspaceFiles(repoRoot, repoRoot);

  return Promise.all(
    files.map(async (path) => ({
      path,
      content: await readFile(path, 'utf8'),
      projectId: targetProjectId,
    })),
  );
}

async function collectWorkspaceFiles(root: string, currentDir: string): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const absolutePath = join(currentDir, entry.name);
    const relativePath = relative(root, absolutePath);

    if (entry.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(entry.name) || relativePath.startsWith('.qore/')) {
        continue;
      }
      files.push(...await collectWorkspaceFiles(root, absolutePath));
      continue;
    }

    if (!TEXT_FILE_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }

    if (!WORKSPACE_PATH_PREFIXES.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`))) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
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

  async searchChunksByVector(): Promise<SearchChunkHit[]> {
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

  private resolveProjectIdForCache(entry: CacheEntryRecord) {
    const documentRef = entry.dependencyRefs.find((ref) => ref.kind === 'document');
    const document = documentRef ? this.documents.get(documentRef.id) : undefined;
    return document?.projectId ?? 'unknown';
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
  if (score === 0) {
    return 0;
  }

  if (NOISY_AUTOMATION_MARKERS.some((marker) => haystack.includes(marker))) {
    score = Math.max(0, score - 4);
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

const WORKSPACE_PATH_PREFIXES = ['zo', 'runtime', 'docs'];
const TEXT_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.md', '.json']);
const SKIPPED_DIR_NAMES = new Set(['node_modules', 'dist', 'build', 'coverage', 'tmp', 'temp']);
const WORKSPACE_GROUNDED_SOURCE_KINDS = new Set(['project', 'path', 'constellation']);
const NOISY_AUTOMATION_MARKERS = [
  'victor-heartbeat',
  'victor-automation-action',
  'cooldown reflection',
  'autonomy/claim',
  '"actionkind"',
  '"runid"',
];
