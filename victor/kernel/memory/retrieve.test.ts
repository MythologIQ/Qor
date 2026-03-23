import { describe, expect, it } from 'bun:test';

import { retrieveGroundedContext } from './retrieve';
import type { GraphStore, RetrievalStore } from './store';

function makeStore(): GraphStore & RetrievalStore {
  return {
    async initialize() {},
    async close() {},
    async loadDocumentSnapshot(documentId) {
      return {
        document: {
          id: documentId,
          path: 'memory.md',
          projectId: 'victor',
          title: 'memory.md',
          contentType: 'text/markdown',
          fingerprint: 'doc',
          contentLength: 10,
          updatedAt: 1,
        },
        chunks: [
          {
            id: 'chunk-1',
            documentId,
            index: 0,
            fingerprint: 'chunk',
            text: 'Victor uses Neo4j memory',
            tokenEstimate: 5,
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          },
        ],
        semanticNodes: [
          {
            id: 'node-1',
            documentId,
            sourceChunkId: 'chunk-1',
            nodeType: 'Decision',
            label: 'Storage choice',
            summary: 'Use Neo4j first',
            fingerprint: 'node',
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
            attributes: {},
            state: 'active',
          },
          {
            id: 'node-2',
            documentId,
            sourceChunkId: 'chunk-1',
            nodeType: 'Task',
            label: 'Implement retrieval',
            summary: 'Implement retrieval',
            fingerprint: 'task',
            span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
            attributes: {},
            state: 'active',
          },
        ],
        semanticEdges: [],
        cacheEntries: [],
      };
    },
    async upsertDocument() {},
    async replaceDocumentChunks() {},
    async upsertSemanticNodes() {},
    async markSemanticNodesTombstoned() {},
    async upsertSemanticEdges() {},
    async markSemanticEdgesTombstoned() {},
    async upsertCacheEntries() {},
    async markCacheEntriesStale() {},
    async appendIngestionRun() {},
    async appendFailureMemory() {},
    async remediateFailureMemories() { return 0; },
    async markNegativeConstraintSummaryStale() {},
    async listFailureMemory() { return []; },
    async appendGovernanceEvent() {},
    async searchChunks() {
      return [
        {
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            index: 0,
            fingerprint: 'chunk',
            text: 'Victor uses Neo4j memory',
            tokenEstimate: 5,
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          },
          score: 3,
        },
      ];
    },
    async searchChunksByVector() {
      return [];
    },
    async searchSemanticNodes() {
      return [];
    },
    async expandNeighborhood() {
      return {
        nodes: [
          {
            id: 'node-1',
            documentId: 'doc-1',
            sourceChunkId: 'chunk-1',
            nodeType: 'Decision',
            label: 'Storage choice',
            summary: 'Use Neo4j first',
            fingerprint: 'node',
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
            attributes: {},
            state: 'active',
          },
          {
            id: 'node-2',
            documentId: 'doc-1',
            sourceChunkId: 'chunk-1',
            nodeType: 'Task',
            label: 'Implement retrieval',
            summary: 'Implement retrieval',
            fingerprint: 'task',
            span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
            attributes: {},
            state: 'active',
          },
        ],
        edges: [],
      };
    },
    async loadFreshCacheEntries() {
      return [
        {
          id: 'cache-1',
          cacheType: 'stable-summary',
          summary: 'Victor memory kernel uses Neo4j',
          status: 'fresh',
          dependencyRefs: [{ kind: 'document', id: 'doc-1' }],
          updatedAt: 1,
        },
      ];
    },
  };
}

describe('retrieveGroundedContext', () => {
  it('returns grounded context with evidence and no missing info when tasks and decisions exist', async () => {
    const result = await retrieveGroundedContext(makeStore(), 'victor', 'neo4j memory', { skipCacheValidation: true });

    expect(result.chunkHits).toHaveLength(1);
    expect(result.semanticNodes.some((node) => node.nodeType === 'Decision')).toBe(true);
    expect(result.semanticNodes.some((node) => node.nodeType === 'Task')).toBe(true);
    expect(result.cacheEntries[0].id).toBe('cache-1');
    expect(result.missingInformation).toEqual([]);
    expect(result.recallDecision?.mode).toBe('grounded');
    expect(result.retrievalTrace?.chunkStrategy).toBe('lexical');
    expect(result.retrievalTrace?.negativeConstraintSource).toBe('none');
  });

  it('returns insufficient evidence signals when retrieval is empty', async () => {
    const emptyStore = makeStore();
    emptyStore.searchChunks = async () => [];
    emptyStore.searchChunksByVector = async () => [];
    emptyStore.searchSemanticNodes = async () => [];
    emptyStore.expandNeighborhood = async () => ({ nodes: [], edges: [] });
    emptyStore.loadFreshCacheEntries = async () => [];

    const result = await retrieveGroundedContext(emptyStore, 'victor', 'unknown topic');

    expect(result.chunkHits).toHaveLength(0);
    expect(result.missingInformation[0]).toContain('No matching source chunks');
    expect(result.recommendedNextActions[0]).toContain('Ingest');
    expect(result.recallDecision?.mode).toBe('blocked');
  });

  it('prefers vector hits when an embedding function is available', async () => {
    const store = makeStore();
    store.searchChunksByVector = async () => [
      {
        chunk: {
          id: 'chunk-vector',
          documentId: 'doc-1',
          index: 1,
          fingerprint: 'vector',
          text: 'vector hit',
          tokenEstimate: 2,
          span: { startLine: 3, endLine: 3, startOffset: 0, endOffset: 10 },
        },
        score: 9,
      },
    ];

    const result = await retrieveGroundedContext(
      store,
      'victor',
      'neo4j memory',
      { embedQuery: async () => [0.1, 0.2] },
    );

    expect(result.chunkHits[0].chunk.id).toBe('chunk-vector');
    expect(result.retrievalTrace?.chunkStrategy).toBe('vector');
  });

  it('retains seed semantic nodes even when graph expansion returns no neighbors', async () => {
    const store = makeStore();
    store.expandNeighborhood = async () => ({ nodes: [], edges: [] });

    const result = await retrieveGroundedContext(store, 'victor', 'neo4j memory');

    expect(result.semanticNodes.some((node) => node.id === 'node-1')).toBe(true);
    expect(result.semanticNodes.some((node) => node.id === 'node-2')).toBe(true);
  });

  it('returns direct semantic node hits even when chunk search is weak', async () => {
    const store = makeStore();
    store.searchChunks = async () => [];
    store.searchSemanticNodes = async () => [
      {
        id: 'decision-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Decision',
        label: 'Victor is the authoritative memory resident',
        summary: 'Victor is the authoritative memory resident',
        fingerprint: 'decision',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: {},
        state: 'active',
      },
    ];
    store.expandNeighborhood = async () => ({ nodes: [], edges: [] });

    const result = await retrieveGroundedContext(store, 'victor', 'authoritative memory decision');

    expect(result.semanticNodes.some((node) => node.id === 'decision-1')).toBe(true);
    expect(result.chunkHits.some((hit) => hit.chunk.id === 'chunk-1')).toBe(true);
    expect(result.missingInformation).not.toContain('No matching source chunks were found for this query.');
    expect(result.missingInformation).not.toContain('No explicit decision node was found in the retrieved context.');
  });

  it('infers a concrete next action for active-task reflection from supported goals', async () => {
    const store = makeStore();
    store.searchChunks = async () => [
      {
        chunk: {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk',
          text: 'Automate comms-tab prompt construction with a compact operations display.',
          tokenEstimate: 10,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        },
        score: 8,
      },
    ];
    store.searchSemanticNodes = async () => [
      {
        id: 'task-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Task',
        label: 'Automate comms-tab prompt construction',
        summary: 'Automate comms-tab prompt construction',
        fingerprint: 'task-1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { status: 'in-progress', taskId: 'task-1' },
        state: 'active',
      },
      {
        id: 'goal-1',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-1',
        nodeType: 'Goal',
        label: 'A compact operations display shows prompt construction/provenance in real time.',
        summary: 'A compact operations display shows prompt construction/provenance in real time.',
        fingerprint: 'goal-1',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: {},
        state: 'active',
      },
    ];
    store.expandNeighborhood = async () => ({
      nodes: [
        {
          id: 'task-1',
          documentId: 'doc-1',
          sourceChunkId: 'chunk-1',
          nodeType: 'Task',
          label: 'Automate comms-tab prompt construction',
          summary: 'Automate comms-tab prompt construction',
          fingerprint: 'task-1',
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          attributes: { status: 'in-progress', taskId: 'task-1' },
          state: 'active',
        },
        {
          id: 'goal-1',
          documentId: 'doc-1',
          sourceChunkId: 'chunk-1',
          nodeType: 'Goal',
          label: 'A compact operations display shows prompt construction/provenance in real time.',
          summary: 'A compact operations display shows prompt construction/provenance in real time.',
          fingerprint: 'goal-1',
          span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
          attributes: {},
          state: 'active',
        },
      ],
      edges: [
        {
          id: 'edge-1',
          documentId: 'doc-1',
          sourceChunkId: 'chunk-1',
          fromNodeId: 'task-1',
          toNodeId: 'goal-1',
          edgeType: 'supports',
          fingerprint: 'edge-1',
          attributes: {},
          state: 'active',
        },
      ],
    });

    const result = await retrieveGroundedContext(
      store,
      'victor',
      'What is the next grounded reflection for the active governed automation task "Automate comms-tab prompt construction"?',
    );

    expect(result.recommendedNextActions).toContain('Build prompt-construction operations display');
  });

  it('pulls dependency nodes from grounded documents when dependency intent is implied by the phase query', async () => {
    const store = makeStore();
    store.searchChunks = async () => [
      {
        chunk: {
          id: 'chunk-forecast',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-forecast',
          text: 'Forecast remaining Builder delivery work in Forecast and Planning Operations.',
          tokenEstimate: 10,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        },
        score: 9,
      },
    ];
    store.searchSemanticNodes = async () => [
      {
        id: 'task-forecast',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-forecast',
        nodeType: 'Task',
        label: 'Forecast remaining Builder delivery work',
        summary: 'Forecast remaining Builder delivery work',
        fingerprint: 'task-forecast',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { status: 'pending', taskId: 'task-forecast' },
        state: 'active',
      },
      {
        id: 'module-forecast',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-forecast',
        nodeType: 'Module',
        label: 'Phase 4: Forecast and Dependency Operations',
        summary: 'Phase 4: Forecast and Dependency Operations',
        fingerprint: 'module-forecast',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: {},
        state: 'active',
      },
    ];
    store.loadDocumentSnapshot = async (documentId) => ({
      document: {
        id: documentId,
        path: 'forecast.md',
        projectId: 'victor',
        title: 'forecast.md',
        contentType: 'text/markdown',
        fingerprint: 'doc-forecast',
        contentLength: 100,
        updatedAt: 1,
      },
      chunks: [
        {
          id: 'chunk-forecast',
          documentId,
          index: 0,
          fingerprint: 'chunk-forecast',
          text: 'Forecast remaining Builder delivery work in Forecast and Dependency Operations.',
          tokenEstimate: 10,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        },
        {
          id: 'chunk-dependency',
          documentId,
          index: 1,
          fingerprint: 'chunk-dependency',
          text: 'Depends On: Victor promotion review packet',
          tokenEstimate: 7,
          span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 30 },
        },
      ],
      semanticNodes: [
        {
          id: 'task-forecast',
          documentId,
          sourceChunkId: 'chunk-forecast',
          nodeType: 'Task',
          label: 'Forecast remaining Builder delivery work',
          summary: 'Forecast remaining Builder delivery work',
          fingerprint: 'task-forecast',
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          attributes: { status: 'pending', taskId: 'task-forecast' },
          state: 'active',
        },
        {
          id: 'module-forecast',
          documentId,
          sourceChunkId: 'chunk-forecast',
          nodeType: 'Module',
          label: 'Phase 4: Forecast and Dependency Operations',
          summary: 'Phase 4: Forecast and Dependency Operations',
          fingerprint: 'module-forecast',
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          attributes: {},
          state: 'active',
        },
        {
          id: 'dependency-forecast',
          documentId,
          sourceChunkId: 'chunk-dependency',
          nodeType: 'Dependency',
          label: 'Victor promotion review packet',
          summary: 'Victor promotion review packet',
          fingerprint: 'dependency-forecast',
          span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 30 },
          attributes: {},
          state: 'active',
        },
      ],
      semanticEdges: [],
      cacheEntries: [],
    });
    store.expandNeighborhood = async () => ({ nodes: [], edges: [] });

    const result = await retrieveGroundedContext(
      store,
      'victor',
      'What dependency should be checked next for the governed automation task "Forecast remaining Builder delivery work" in phase "Forecast and Dependency Operations"?',
    );

    expect(result.semanticNodes.some((node) => node.nodeType === 'Dependency' && node.label === 'Victor promotion review packet')).toBe(true);
    expect(result.missingInformation).not.toContain('No dependency node was found in the retrieved context.');
  });

  it('does not require dependency nodes just because the task title contains dependency language', async () => {
    const store = makeStore();
    store.searchChunks = async () => [
      {
        chunk: {
          id: 'chunk-impact',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-impact',
          text: 'Project Victor autonomy dependency impact into Builder surfaces.',
          tokenEstimate: 9,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        },
        score: 8,
      },
    ];
    store.searchSemanticNodes = async () => [
      {
        id: 'task-impact',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-impact',
        nodeType: 'Task',
        label: 'Project Victor autonomy dependency impact into Builder surfaces',
        summary: 'Project Victor autonomy dependency impact into Builder surfaces',
        fingerprint: 'task-impact',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { status: 'pending', taskId: 'task_builder_victor_dependency' },
        state: 'active',
      },
      {
        id: 'decision-impact',
        documentId: 'doc-1',
        sourceChunkId: 'chunk-impact',
        nodeType: 'Decision',
        label: 'Builder should show Victor impact only where it changes delivery readiness.',
        summary: 'Builder should show Victor impact only where it changes delivery readiness.',
        fingerprint: 'decision-impact',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: {},
        state: 'active',
      },
    ];
    store.expandNeighborhood = async () => ({ nodes: [], edges: [] });

    const result = await retrieveGroundedContext(
      store,
      'victor',
      'What should happen next with the governed automation task "Project Victor autonomy dependency impact into Builder surfaces" in phase "Forecast and Planning Operations"?',
    );

    expect(result.semanticNodes.some((node) => node.id === 'task-impact')).toBe(true);
    expect(result.missingInformation).not.toContain('No dependency node was found in the retrieved context.');
  });

  it('injects unresolved negative constraints into retrieval guidance', async () => {
    const store = makeStore();
    store.listFailureMemory = async () => [
      {
        id: 'failure-1',
        projectId: 'victor',
        createdAt: 1,
        summary: 'Contradiction collapse',
        failureMode: 'LOGIC_ERROR',
        negativeConstraint: 'AVOID: collapsing contradictory authority claims into one answer',
        remediationStatus: 'UNRESOLVED',
      },
    ];

    const result = await retrieveGroundedContext(store, 'victor', 'authority model');

    expect(result.missingInformation.some((item) => item.includes('Unresolved negative constraint'))).toBe(true);
    expect(result.recommendedNextActions.some((item) => item.includes('Honor unresolved failure constraint'))).toBe(true);
    expect(result.retrievalTrace?.negativeConstraintSource).toBe('failure-memory');
  });

  it('prefers the negative constraint summary cache over raw failure-memory reads', async () => {
    const store = makeStore();
    store.loadFreshCacheEntries = async () => [
      {
        id: 'negative-constraint-summary:victor',
        cacheType: 'negative-constraint-summary',
        summary: 'AVOID: collapse contradictory authority claims\nREQUIRE: retrieve canonical authority docs first',
        status: 'fresh',
        dependencyRefs: [{ kind: 'failure-memory', id: 'failure-1' }],
        updatedAt: 1,
        purpose: 'negative-constraint-summary',
      },
    ];
    store.listFailureMemory = async () => {
      throw new Error('retrieveGroundedContext should not hit raw failure memory when summary cache is present');
    };

    const result = await retrieveGroundedContext(store, 'victor', 'authority model', { skipCacheValidation: true });

    expect(result.missingInformation).toContain('Unresolved negative constraint: AVOID: collapse contradictory authority claims');
    expect(result.recommendedNextActions).toContain('Honor unresolved failure constraint: REQUIRE: retrieve canonical authority docs first');
    expect(result.retrievalTrace?.negativeConstraintSource).toBe('cache');
  });
});
