/**
 * UOR Cache Validation Integration Tests for Retrieval Pipeline
 *
 * Tests the integration of UOR fingerprint-based cache validation into the
 * retrieveGroundedContext function, ensuring stale cache entries are filtered
 * out during retrieval.
 *
 * See: task_victor_uor_cache_validation_integration
 */

import { describe, expect, it } from 'bun:test';
import { retrieveGroundedContext } from './retrieve';
import type { LearningStore } from './store';
import type { CacheEntryRecord, DocumentSnapshot } from './types';

function makeStoreWithCacheValidation(
  options: {
    cacheEntries?: CacheEntryRecord[];
    documentSnapshots?: Map<string, DocumentSnapshot>;
  } = {},
): LearningStore {
  const snapshots = options.documentSnapshots ?? new Map<string, DocumentSnapshot>();
  const cacheEntries = options.cacheEntries ?? [];

  return {
    async initialize() {},
    async close() {},
    async index() {},
    async query() { return []; },
    async update() {},
    async updateHeatmap() {},
    async loadDocumentSnapshot(documentId: string) {
      const snapshot = snapshots.get(documentId);
      if (!snapshot) {
        throw new Error(`Document ${documentId} not found`);
      }
      return snapshot;
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
    async searchChunks() {
      return [
        {
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            index: 0,
            fingerprint: 'chunk-fingerprint-v1',
            text: 'Victor uses Neo4j memory',
            tokenEstimate: 5,
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
            uorId: 'uor:source-chunk:doc-1:1-1:sha256:abc123',
          },
          score: 3,
        },
      ];
    },
    async searchChunksByVector() { return []; },
    async searchSemanticNodes() { return []; },
    async expandNeighborhood() {
      return {
        nodes: [
          {
            id: 'node-1',
            documentId: 'doc-1',
            sourceChunkId: 'chunk-1',
            nodeType: 'Decision' as const,
            label: 'Storage choice',
            summary: 'Use Neo4j first',
            fingerprint: 'node-fingerprint-v1',
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
            attributes: {},
            state: 'active' as const,
          },
        ],
        edges: [],
      };
    },
    async loadFreshCacheEntries() {
      return cacheEntries;
    },
    async appendGovernanceEvent() {},
  };
}

describe('UOR Cache Validation in Retrieval Pipeline', () => {
  it('should filter out cache entries with stale UOR fingerprints', async () => {
    // Create a document snapshot with current fingerprints
    const docSnapshot: DocumentSnapshot = {
      document: {
        id: 'doc-1',
        path: 'memory.md',
        projectId: 'victor',
        title: 'memory.md',
        contentType: 'text/markdown',
        fingerprint: 'doc-fingerprint-v2', // Changed from v1
        contentLength: 100,
        updatedAt: Date.now(),
        uorId: 'uor:source-document:doc-1:v2:sha256:def456',
      },
      chunks: [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-fingerprint-v2', // Changed from v1
          text: 'Victor uses Neo4j memory with UOR grounding',
          tokenEstimate: 6,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          uorId: 'uor:source-chunk:doc-1:1-1:sha256:def456',
        },
      ],
      semanticNodes: [],
      semanticEdges: [],
      cacheEntries: [],
    };

    // Create cache entry with OLD fingerprint (stale)
    const staleCacheEntry: CacheEntryRecord = {
      id: 'cache-stale',
      cacheType: 'stable-summary',
      summary: 'Old summary',
      status: 'fresh',
      dependencyRefs: [
        {
          kind: 'document',
          id: 'doc-1',
          // @ts-expect-error - Adding uorFingerprint for testing
          uorFingerprint: 'uor:source-document:doc-1:v1:sha256:abc123', // Old fingerprint
        },
      ],
      updatedAt: Date.now(),
    };

    const store = makeStoreWithCacheValidation({
      cacheEntries: [staleCacheEntry],
      documentSnapshots: new Map([['doc-1', docSnapshot]]),
    });

    const result = await retrieveGroundedContext(store, 'victor', 'neo4j memory');

    // Cache entry should be filtered out due to stale fingerprint
    expect(result.cacheEntries).toHaveLength(0);
    expect(result.retrievalTrace?.cacheInvalidatedCount).toBe(1);
    expect(result.retrievalTrace?.cacheValidatedCount).toBe(0);
  });

  it('should keep cache entries with valid UOR fingerprints', async () => {
    // Create a document snapshot with current fingerprints
    const docSnapshot: DocumentSnapshot = {
      document: {
        id: 'doc-1',
        path: 'memory.md',
        projectId: 'victor',
        title: 'memory.md',
        contentType: 'text/markdown',
        fingerprint: 'doc-fingerprint-v1',
        contentLength: 100,
        updatedAt: Date.now(),
        uorId: 'uor:source-document:doc-1:v1:sha256:abc123',
      },
      chunks: [],
      semanticNodes: [],
      semanticEdges: [],
      cacheEntries: [],
    };

    // Create cache entry with CURRENT fingerprint (valid)
    const validCacheEntry: CacheEntryRecord = {
      id: 'cache-valid',
      cacheType: 'stable-summary',
      summary: 'Current summary',
      status: 'fresh',
      dependencyRefs: [
        {
          kind: 'document',
          id: 'doc-1',
          // @ts-expect-error - Adding uorFingerprint for testing
          uorFingerprint: 'uor:source-document:doc-1:v1:sha256:abc123', // Current fingerprint
        },
      ],
      updatedAt: Date.now(),
    };

    const store = makeStoreWithCacheValidation({
      cacheEntries: [validCacheEntry],
      documentSnapshots: new Map([['doc-1', docSnapshot]]),
    });

    const result = await retrieveGroundedContext(store, 'victor', 'neo4j memory');

    // Cache entry should be kept due to valid fingerprint
    expect(result.cacheEntries).toHaveLength(1);
    expect(result.cacheEntries[0].id).toBe('cache-valid');
    expect(result.retrievalTrace?.cacheValidatedCount).toBe(1);
    expect(result.retrievalTrace?.cacheInvalidatedCount).toBe(0);
  });

  it('should skip validation when skipCacheValidation option is true', async () => {
    // Create document snapshot for the retrieval pipeline
    const docSnapshot: DocumentSnapshot = {
      document: {
        id: 'doc-1',
        path: 'memory.md',
        projectId: 'victor',
        title: 'memory.md',
        contentType: 'text/markdown',
        fingerprint: 'doc-fingerprint-v1',
        contentLength: 100,
        updatedAt: Date.now(),
        uorId: 'uor:source-document:doc-1:v1:sha256:abc123',
      },
      chunks: [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-fingerprint-v1',
          text: 'Victor uses Neo4j memory',
          tokenEstimate: 5,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          uorId: 'uor:source-chunk:doc-1:1-1:sha256:abc123',
        },
      ],
      semanticNodes: [],
      semanticEdges: [],
      cacheEntries: [],
    };

    // Create cache entry (fingerprint doesn't matter when validation is skipped)
    const cacheEntry: CacheEntryRecord = {
      id: 'cache-1',
      cacheType: 'stable-summary',
      summary: 'Summary',
      status: 'fresh',
      dependencyRefs: [{ kind: 'document', id: 'doc-1' }],
      updatedAt: Date.now(),
    };

    const store = makeStoreWithCacheValidation({
      cacheEntries: [cacheEntry],
      documentSnapshots: new Map([['doc-1', docSnapshot]]),
    });

    const result = await retrieveGroundedContext(
      store,
      'victor',
      'neo4j memory',
      { skipCacheValidation: true },
    );

    // Cache entry should be kept when validation is skipped
    expect(result.cacheEntries).toHaveLength(1);
  });

  it('should report cache validation metrics in retrieval trace', async () => {
    // Create document snapshot
    const docSnapshot: DocumentSnapshot = {
      document: {
        id: 'doc-1',
        path: 'memory.md',
        projectId: 'victor',
        title: 'memory.md',
        contentType: 'text/markdown',
        fingerprint: 'doc-fingerprint-v2',
        contentLength: 100,
        updatedAt: Date.now(),
        uorId: 'uor:source-document:doc-1:v2:sha256:def456',
      },
      chunks: [],
      semanticNodes: [],
      semanticEdges: [],
      cacheEntries: [],
    };

    // Create mix of valid and stale cache entries
    const validEntry: CacheEntryRecord = {
      id: 'cache-valid',
      cacheType: 'stable-summary',
      summary: 'Valid summary',
      status: 'fresh',
      dependencyRefs: [
        {
          kind: 'document',
          id: 'doc-1',
          // @ts-expect-error
          uorFingerprint: 'uor:source-document:doc-1:v2:sha256:def456', // Matches current
        },
      ],
      updatedAt: Date.now(),
    };

    const staleEntry: CacheEntryRecord = {
      id: 'cache-stale',
      cacheType: 'stable-summary',
      summary: 'Stale summary',
      status: 'fresh',
      dependencyRefs: [
        {
          kind: 'document',
          id: 'doc-1',
          // @ts-expect-error
          uorFingerprint: 'uor:source-document:doc-1:v1:sha256:abc123', // Old
        },
      ],
      updatedAt: Date.now(),
    };

    const store = makeStoreWithCacheValidation({
      cacheEntries: [validEntry, staleEntry],
      documentSnapshots: new Map([['doc-1', docSnapshot]]),
    });

    const result = await retrieveGroundedContext(store, 'victor', 'neo4j memory');

    // Should have validation metrics
    expect(result.retrievalTrace?.cacheValidatedCount).toBe(1);
    expect(result.retrievalTrace?.cacheInvalidatedCount).toBe(1);
    expect(result.cacheEntries).toHaveLength(1); // Only valid entry
    expect(result.cacheEntries[0].id).toBe('cache-valid');
  });

  it('should handle missing document dependencies', async () => {
    // Create document snapshot for the retrieval pipeline
    const docSnapshot: DocumentSnapshot = {
      document: {
        id: 'doc-1',
        path: 'memory.md',
        projectId: 'victor',
        title: 'memory.md',
        contentType: 'text/markdown',
        fingerprint: 'doc-fingerprint-v1',
        contentLength: 100,
        updatedAt: Date.now(),
        uorId: 'uor:source-document:doc-1:v1:sha256:abc123',
      },
      chunks: [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          index: 0,
          fingerprint: 'chunk-fingerprint-v1',
          text: 'Victor uses Neo4j memory',
          tokenEstimate: 5,
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          uorId: 'uor:source-chunk:doc-1:1-1:sha256:abc123',
        },
      ],
      semanticNodes: [],
      semanticEdges: [],
      cacheEntries: [],
    };

    // Create cache entry referencing non-existent document
    const cacheEntry: CacheEntryRecord = {
      id: 'cache-missing-dep',
      cacheType: 'stable-summary',
      summary: 'Summary with missing dependency',
      status: 'fresh',
      dependencyRefs: [
        {
          kind: 'document',
          id: 'non-existent-doc',
          // @ts-expect-error
          uorFingerprint: 'uor:source-document:non-existent-doc:v1:sha256:abc123',
        },
      ],
      updatedAt: Date.now(),
    };

    const store = makeStoreWithCacheValidation({
      cacheEntries: [cacheEntry],
      documentSnapshots: new Map([['doc-1', docSnapshot]]),
    });

    const result = await retrieveGroundedContext(store, 'victor', 'neo4j memory');

    // Entry should be filtered out due to missing dependency
    expect(result.cacheEntries).toHaveLength(0);
    expect(result.retrievalTrace?.cacheInvalidatedCount).toBe(1);
    expect(result.retrievalTrace?.cacheMissingDependencyCount).toBe(1);
  });
});
