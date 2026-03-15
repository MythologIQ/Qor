import { describe, expect, it } from 'bun:test';

import { retrieveGroundedContext } from './retrieve';
import type { LearningStore } from './store';

function makeStore(): LearningStore {
  return {
    async initialize() {},
    async close() {},
    async index() {},
    async query() { return []; },
    async update() {},
    async updateHeatmap() {},
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
    const result = await retrieveGroundedContext(makeStore(), 'victor', 'neo4j memory');

    expect(result.chunkHits).toHaveLength(1);
    expect(result.semanticNodes.some((node) => node.nodeType === 'Decision')).toBe(true);
    expect(result.semanticNodes.some((node) => node.nodeType === 'Task')).toBe(true);
    expect(result.cacheEntries[0].id).toBe('cache-1');
    expect(result.missingInformation).toEqual([]);
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
});
