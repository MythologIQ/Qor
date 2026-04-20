import { retrieveGroundedContext } from './retrieve';
import type { LearningStore } from './store';
import type {
  CacheEntryRecord,
  DocumentSnapshot,
  GraphNeighborhood,
  IngestionRunRecord,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
} from './types';

export interface EvaluationCase {
  id: string;
  description: string;
  projectId: string;
  query: string;
  fixture: EvaluationFixture;
  expected: EvaluationExpectation;
}

export interface EvaluationExpectation {
  requiredNodeTypes?: SemanticNodeRecord['nodeType'][];
  requiredNodeLabels?: string[];
  requiredChunkDocumentPaths?: string[];
  requiredContradictionKeys?: string[];
  requiredCacheIds?: string[];
  forbiddenCacheIds?: string[];
  missingInformationIncludes?: string[];
  missingInformationExcludes?: string[];
}

export interface EvaluationCaseResult {
  id: string;
  description: string;
  passed: boolean;
  failures: string[];
}

export interface EvaluationReport {
  total: number;
  passed: number;
  failed: number;
  results: EvaluationCaseResult[];
}

interface EvaluationFixture {
  documents: SourceDocumentRecord[];
  chunks: SourceChunkRecord[];
  semanticNodes: SemanticNodeRecord[];
  semanticEdges: SemanticEdgeRecord[];
  cacheEntries: CacheEntryRecord[];
}

export const EVALUATION_CASES: EvaluationCase[] = [
  {
    id: 'recall-grounded-decision',
    description: 'retrieval should recall the governing resident-intelligence decision from design artifacts',
    projectId: 'victor',
    query: 'Which decision says Victor is the resident intelligence?',
    fixture: {
      documents: [
        createDocument('doc-design', 'victor', 'docs/design.md'),
      ],
      chunks: [
        createChunk('chunk-design', 'doc-design', 0, 'Victor is the resident intelligence and Builder Console is the governed execution subsystem.'),
      ],
      semanticNodes: [
        createNode('decision-resident', 'doc-design', 'chunk-design', 'Decision', 'Victor is the resident intelligence'),
        createNode('constraint-builder', 'doc-design', 'chunk-design', 'Constraint', 'Builder Console is the governed execution subsystem'),
      ],
      semanticEdges: [],
      cacheEntries: [],
    },
    expected: {
      requiredNodeTypes: ['Decision'],
      requiredNodeLabels: ['Victor is the resident intelligence'],
      requiredChunkDocumentPaths: ['docs/design.md'],
      missingInformationExcludes: ['No explicit decision node was found in the retrieved context.'],
    },
  },
  {
    id: 'insufficient-evidence',
    description: 'retrieval should explicitly report insufficient evidence when nothing relevant exists',
    projectId: 'victor',
    query: 'Who owns the Builder Console deployment calendar?',
    fixture: {
      documents: [
        createDocument('doc-notes', 'victor', 'notes/random.md'),
      ],
      chunks: [
        createChunk('chunk-notes', 'doc-notes', 0, 'This note covers typography choices and color palettes only.'),
      ],
      semanticNodes: [],
      semanticEdges: [],
      cacheEntries: [],
    },
    expected: {
      missingInformationIncludes: ['No matching source chunks were found for this query.'],
    },
  },
  {
    id: 'contradiction-surfacing',
    description: 'retrieval should surface contradictory semantic assertions instead of collapsing them',
    projectId: 'victor',
    query: 'What is the authority model for Victor?',
    fixture: {
      documents: [
        createDocument('doc-a', 'victor', 'docs/authority-a.md'),
        createDocument('doc-b', 'victor', 'docs/authority-b.md'),
      ],
      chunks: [
        createChunk('chunk-a', 'doc-a', 0, 'Authority model says Victor is the authoritative memory resident.'),
        createChunk('chunk-b', 'doc-b', 0, 'Authority model says Builder Console remains the canonical semantic authority.'),
      ],
      semanticNodes: [
        createNode('decision-authority-a', 'doc-a', 'chunk-a', 'Decision', 'Authority model', 'Victor is the authoritative memory resident'),
        createNode('decision-authority-b', 'doc-b', 'chunk-b', 'Decision', 'Authority model', 'Builder Console remains the canonical semantic authority'),
      ],
      semanticEdges: [],
      cacheEntries: [],
    },
    expected: {
      requiredContradictionKeys: ['Decision:authority model'],
      missingInformationIncludes: ['Conflicting semantic assertions need resolution before acting on this result.'],
    },
  },
  {
    id: 'stale-cache-rejection',
    description: 'retrieval should reject stale cache entries even when their summary matches the query perfectly',
    projectId: 'victor',
    query: 'What are the trust boundaries for Victor?',
    fixture: {
      documents: [
        createDocument('doc-trust', 'victor', 'docs/trust.md'),
      ],
      chunks: [
        createChunk('chunk-trust', 'doc-trust', 0, 'Trust boundaries require observe-only operation and explicit provenance.'),
      ],
      semanticNodes: [
        createNode('decision-trust', 'doc-trust', 'chunk-trust', 'Decision', 'Trust boundary', 'Observe-only operation is the main trust boundary'),
      ],
      semanticEdges: [],
      cacheEntries: [
        createCache('cache-fresh', 'fresh', 'Observe-only operation is the main trust boundary', [{ kind: 'document', id: 'doc-trust' }]),
        createCache('cache-stale', 'stale', 'Observe-only operation is the main trust boundary', [{ kind: 'document', id: 'doc-trust' }]),
      ],
    },
    expected: {
      requiredCacheIds: ['cache-fresh'],
      forbiddenCacheIds: ['cache-stale'],
    },
  },
  {
    id: 'builder-console-task-recall',
    description: 'retrieval should recall a real Builder Console task for comms-tab prompt automation',
    projectId: 'builder-console',
    query: 'What comms tab prompt automation task exists in Builder Console?',
    fixture: {
      documents: [
        createDocument('doc-builder-project', 'builder-console', 'builder-console/builder-console/project.md'),
        createDocument('doc-builder-path', 'builder-console', 'builder-console/builder-console/path.md'),
      ],
      chunks: [
        createChunk(
          'chunk-builder-project',
          'doc-builder-project',
          0,
          'Decision: Builder Console governance is binding on Victor when operating through these artifacts.',
        ),
        createChunk(
          'chunk-builder-path',
          'doc-builder-path',
          0,
          'Phase: Comms Tab Prompt Automation. Task: Automate comms-tab prompt construction. Move prompt-building components behind an automated pipeline so the visible interface becomes standard chat input/output with a small operations panel that streams prompt-construction steps as they happen.',
        ),
      ],
      semanticNodes: [
        createNode(
          'decision-builder-governance',
          'doc-builder-project',
          'chunk-builder-project',
          'Decision',
          'Builder Console governance is binding on Victor when operating through these artifacts.',
        ),
        createNode(
          'goal-comms-automation',
          'doc-builder-path',
          'chunk-builder-path',
          'Goal',
          'Automate prompt-building inside the comms tab so the user experience collapses to standard chat input/output plus a compact operations display showing prompt construction in real time.',
        ),
        createNode(
          'task-comms-automation',
          'doc-builder-path',
          'chunk-builder-path',
          'Task',
          'Automate comms-tab prompt construction',
        ),
      ],
      semanticEdges: [],
      cacheEntries: [],
    },
    expected: {
      requiredNodeTypes: ['Task', 'Goal'],
      requiredNodeLabels: ['Automate comms-tab prompt construction'],
      requiredChunkDocumentPaths: ['builder-console/builder-console/path.md'],
      missingInformationExcludes: ['No active task node was found in the retrieved context.'],
    },
  },
  {
    id: 'builder-console-governance-without-task',
    description: 'retrieval should not hallucinate task-state when Builder Console only exposes governance activity',
    projectId: 'builder-console',
    query: 'What Builder Console task is currently active?',
    fixture: {
      documents: [
        createDocument('doc-builder-ledger', 'builder-console', 'builder-console/proj_meta/ledger.md'),
        createDocument('doc-builder-history', 'builder-console', 'builder-console/proj_meta/history.md'),
      ],
      chunks: [
        createChunk(
          'chunk-builder-ledger',
          'doc-builder-ledger',
          0,
          'Builder Console Governance Ledger. Recent entry: void/create by actor frostwulf.',
        ),
        createChunk(
          'chunk-builder-history',
          'doc-builder-history',
          0,
          'Builder Console Historical Activity. Recent entries show governance and project creation only.',
        ),
      ],
      semanticNodes: [
        createNode(
          'module-builder-ledger',
          'doc-builder-ledger',
          'chunk-builder-ledger',
          'Module',
          'Builder Console Governance Ledger',
        ),
        createNode(
          'module-builder-history',
          'doc-builder-history',
          'chunk-builder-history',
          'Module',
          'Builder Console Historical Activity',
        ),
      ],
      semanticEdges: [],
      cacheEntries: [],
    },
    expected: {
      requiredNodeTypes: ['Module'],
      missingInformationIncludes: ['No active task node was found in the retrieved context.'],
      missingInformationExcludes: ['No explicit decision node was found in the retrieved context.'],
    },
  },
];

export async function runEvaluationSuite(
  cases: EvaluationCase[] = EVALUATION_CASES,
): Promise<EvaluationReport> {
  const results: EvaluationCaseResult[] = [];

  for (const testCase of cases) {
    const store = new InMemoryEvaluationStore(testCase.fixture);
    const bundle = await retrieveGroundedContext(store, testCase.projectId, testCase.query);
    const failures = evaluateCase(testCase, bundle, store);

    results.push({
      id: testCase.id,
      description: testCase.description,
      passed: failures.length === 0,
      failures,
    });
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

function evaluateCase(
  testCase: EvaluationCase,
  bundle: Awaited<ReturnType<typeof retrieveGroundedContext>>,
  store: InMemoryEvaluationStore,
): string[] {
  const failures: string[] = [];
  const nodeTypes = new Set(bundle.semanticNodes.map((node) => node.nodeType));
  const nodeLabels = new Set(bundle.semanticNodes.map((node) => node.label));
  const chunkPaths = new Set(
    bundle.chunkHits
      .map((hit) => store.getDocumentPath(hit.chunk.documentId))
      .filter((value): value is string => Boolean(value)),
  );
  const contradictionKeys = new Set(bundle.contradictions.map((item) => item.key));
  const cacheIds = new Set(bundle.cacheEntries.map((entry) => entry.id));

  for (const nodeType of testCase.expected.requiredNodeTypes ?? []) {
    if (!nodeTypes.has(nodeType)) {
      failures.push(`missing semantic node type: ${nodeType}`);
    }
  }

  for (const label of testCase.expected.requiredNodeLabels ?? []) {
    if (!nodeLabels.has(label)) {
      failures.push(`missing semantic node label: ${label}`);
    }
  }

  for (const path of testCase.expected.requiredChunkDocumentPaths ?? []) {
    if (!chunkPaths.has(path)) {
      failures.push(`missing chunk from document: ${path}`);
    }
  }

  for (const key of testCase.expected.requiredContradictionKeys ?? []) {
    if (!contradictionKeys.has(key)) {
      failures.push(`missing contradiction key: ${key}`);
    }
  }

  for (const cacheId of testCase.expected.requiredCacheIds ?? []) {
    if (!cacheIds.has(cacheId)) {
      failures.push(`missing cache entry: ${cacheId}`);
    }
  }

  for (const cacheId of testCase.expected.forbiddenCacheIds ?? []) {
    if (cacheIds.has(cacheId)) {
      failures.push(`unexpected cache entry present: ${cacheId}`);
    }
  }

  for (const message of testCase.expected.missingInformationIncludes ?? []) {
    if (!bundle.missingInformation.includes(message)) {
      failures.push(`missing information message not present: ${message}`);
    }
  }

  for (const message of testCase.expected.missingInformationExcludes ?? []) {
    if (bundle.missingInformation.includes(message)) {
      failures.push(`unexpected missing information message present: ${message}`);
    }
  }

  return failures;
}

class InMemoryEvaluationStore implements LearningStore {
  private readonly documentsById = new Map<string, SourceDocumentRecord>();
  private readonly chunksByDocumentId = new Map<string, SourceChunkRecord[]>();
  private readonly nodesByDocumentId = new Map<string, SemanticNodeRecord[]>();
  private readonly edgesByDocumentId = new Map<string, SemanticEdgeRecord[]>();
  private readonly cacheEntries: CacheEntryRecord[];

  constructor(private readonly fixture: EvaluationFixture) {
    for (const document of fixture.documents) {
      this.documentsById.set(document.id, document);
    }

    for (const chunk of fixture.chunks) {
      this.chunksByDocumentId.set(chunk.documentId, [
        ...(this.chunksByDocumentId.get(chunk.documentId) ?? []),
        chunk,
      ]);
    }

    for (const node of fixture.semanticNodes) {
      this.nodesByDocumentId.set(node.documentId, [
        ...(this.nodesByDocumentId.get(node.documentId) ?? []),
        node,
      ]);
    }

    for (const edge of fixture.semanticEdges) {
      this.edgesByDocumentId.set(edge.documentId, [
        ...(this.edgesByDocumentId.get(edge.documentId) ?? []),
        edge,
      ]);
    }

    this.cacheEntries = fixture.cacheEntries;
  }

  getDocumentPath(documentId: string): string | undefined {
    return this.documentsById.get(documentId)?.path;
  }

  async initialize() {}
  async close() {}
  async index() {}
  async query() { return []; }
  async update() {}
  async updateHeatmap() {}
  async upsertDocument() {}
  async replaceDocumentChunks() {}
  async upsertSemanticNodes() {}
  async markSemanticNodesTombstoned() {}
  async upsertSemanticEdges() {}
  async markSemanticEdgesTombstoned() {}
  async upsertCacheEntries() {}
  async markCacheEntriesStale() {}
  async appendIngestionRun(_run: IngestionRunRecord) {}

  async loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot> {
    return {
      document: this.documentsById.get(documentId),
      chunks: [...(this.chunksByDocumentId.get(documentId) ?? [])],
      semanticNodes: [...(this.nodesByDocumentId.get(documentId) ?? [])],
      semanticEdges: [...(this.edgesByDocumentId.get(documentId) ?? [])],
      cacheEntries: this.cacheEntries.filter((entry) =>
        entry.dependencyRefs.some((ref) => ref.kind === 'document' && ref.id === documentId),
      ),
    };
  }

  async searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]> {
    const terms = tokenizeQuery(query);
    return this.fixture.chunks
      .filter((chunk) => this.documentsById.get(chunk.documentId)?.projectId === projectId)
      .map((chunk) => ({
        chunk,
        score: terms.reduce((score, term) => score + (chunk.text.toLowerCase().includes(term) ? 1 : 0), 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index)
      .slice(0, limit);
  }

  async searchChunksByVector(): Promise<SearchChunkHit[]> {
    return [];
  }

  async searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]> {
    const terms = tokenizeQuery(query);
    return this.fixture.semanticNodes
      .filter((node) => this.documentsById.get(node.documentId)?.projectId === projectId)
      .map((node) => ({
        node,
        score: terms.reduce((score, term) => {
          const label = node.label.toLowerCase();
          const summary = node.summary.toLowerCase();
          const type = node.nodeType.toLowerCase();
          return score
            + (label.includes(term) ? 2 : 0)
            + (summary.includes(term) ? 1 : 0)
            + (type.includes(term) ? 1 : 0);
        }, 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
      .slice(0, limit)
      .map((item) => item.node);
  }

  async expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood> {
    if (seedNodeIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    const maxDepth = Math.max(1, depth);
    const visitedNodes = new Set(seedNodeIds);
    const visitedEdges = new Set<string>();
    let frontier = new Set(seedNodeIds);

    for (let currentDepth = 0; currentDepth < maxDepth; currentDepth += 1) {
      const nextFrontier = new Set<string>();

      for (const edge of this.fixture.semanticEdges) {
        if (edge.state !== 'active') {
          continue;
        }
        if (!frontier.has(edge.fromNodeId) && !frontier.has(edge.toNodeId)) {
          continue;
        }

        visitedEdges.add(edge.id);
        visitedNodes.add(edge.fromNodeId);
        visitedNodes.add(edge.toNodeId);
        nextFrontier.add(edge.fromNodeId);
        nextFrontier.add(edge.toNodeId);
      }

      frontier = nextFrontier;
      if (frontier.size === 0) {
        break;
      }
    }

    return {
      nodes: this.fixture.semanticNodes.filter((node) => visitedNodes.has(node.id)),
      edges: this.fixture.semanticEdges.filter((edge) => visitedEdges.has(edge.id)),
    };
  }

  async loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]> {
    return this.cacheEntries.filter((entry) =>
      entry.status === 'fresh'
      && entry.dependencyRefs.some((ref) =>
        ref.kind === 'document' && this.documentsById.get(ref.id)?.projectId === projectId,
      ),
    );
  }
}

function createDocument(id: string, projectId: string, path: string): SourceDocumentRecord {
  return {
    id,
    projectId,
    path,
    title: path.split('/').pop() || path,
    contentType: 'text/markdown',
    fingerprint: `${id}-fingerprint`,
    contentLength: 100,
    updatedAt: 1,
  };
}

function createChunk(id: string, documentId: string, index: number, text: string): SourceChunkRecord {
  return {
    id,
    documentId,
    index,
    fingerprint: `${id}-fingerprint`,
    text,
    tokenEstimate: Math.max(1, Math.ceil(text.split(/\s+/).length * 1.3)),
    span: {
      startLine: 1,
      endLine: 1,
      startOffset: 0,
      endOffset: text.length,
    },
  };
}

function createNode(
  id: string,
  documentId: string,
  sourceChunkId: string,
  nodeType: SemanticNodeRecord['nodeType'],
  label: string,
  summary = label,
): SemanticNodeRecord {
  return {
    id,
    documentId,
    sourceChunkId,
    nodeType,
    label,
    summary,
    fingerprint: `${id}-fingerprint`,
    span: {
      startLine: 1,
      endLine: 1,
      startOffset: 0,
      endOffset: summary.length,
    },
    attributes: {},
    state: 'active',
  };
}

function createCache(
  id: string,
  status: CacheEntryRecord['status'],
  summary: string,
  dependencyRefs: CacheEntryRecord['dependencyRefs'],
): CacheEntryRecord {
  return {
    id,
    cacheType: 'stable-summary',
    summary,
    status,
    dependencyRefs,
    updatedAt: 1,
  };
}

function tokenizeQuery(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}
