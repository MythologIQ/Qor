import { describe, expect, it } from 'bun:test';

import type {
  CacheEntryRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
  UORFingerprint,
} from './types';

import {
  computeChunkDependencyFingerprint,
  computeDocumentDependencyFingerprint,
  computeNodeDependencyFingerprint,
  findStaleCacheIdsLegacy,
  migrateCacheEntryToUOR,
  migrateDependencyToUOR,
  type UORCacheDependency,
  validateCacheEntries,
  validateCacheEntry,
  validateDependency,
  type FingerprintLookup,
} from './uor-cache-validation';

import { createGovernanceMetadata } from './governance';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestDocument(id: string, fingerprint: string): SourceDocumentRecord {
  return {
    id,
    path: `/test/${id}.md`,
    projectId: 'test-project',
    title: `Test Document ${id}`,
    contentType: 'text/markdown',
    fingerprint,
    contentLength: 1000,
    updatedAt: Date.now(),
    governance: createGovernanceMetadata('sourceDocument'),
  };
}

function createTestChunk(
  id: string,
  documentId: string,
  fingerprint: string,
): SourceChunkRecord {
  return {
    id,
    documentId,
    index: 0,
    fingerprint,
    text: 'Test chunk content',
    tokenEstimate: 10,
    span: { startLine: 1, endLine: 3, startOffset: 0, endOffset: 42 },
    governance: createGovernanceMetadata('sourceChunk'),
  };
}

function createTestNode(
  id: string,
  documentId: string,
  fingerprint: string,
): SemanticNodeRecord {
  return {
    id,
    documentId,
    sourceChunkId: `${documentId}:1-3`,
    nodeType: 'Task',
    label: 'Test Node',
    summary: 'A test semantic node',
    fingerprint,
    span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 20 },
    attributes: {},
    state: 'active',
    governance: createGovernanceMetadata('semanticNode'),
  };
}

function createTestCacheEntry(
  id: string,
  deps: UORCacheDependency[],
  status: 'fresh' | 'stale' = 'fresh',
): CacheEntryRecord {
  return {
    id,
    cacheType: 'stable-summary',
    summary: 'Test cache summary',
    status,
    dependencyRefs: deps,
    updatedAt: Date.now(),
    purpose: 'test-cache',
    governance: createGovernanceMetadata('cacheEntry'),
  };
}

function createMockLookup(options?: {
  docFingerprint?: string;
  chunkFingerprint?: string;
  nodeFingerprint?: string;
}): FingerprintLookup {
  return {
    getDocumentFingerprint: () => options?.docFingerprint,
    getChunkFingerprint: () => options?.chunkFingerprint,
    getNodeFingerprint: () => options?.nodeFingerprint,
  };
}

// ============================================================================
// Fingerprint Computation Tests
// ============================================================================

describe('UOR Fingerprint Computation', () => {
  describe('computeDocumentDependencyFingerprint', () => {
    it('should compute consistent fingerprint for document', () => {
      const doc = createTestDocument('doc-1', 'fingerprint-abc');
      const fp1 = computeDocumentDependencyFingerprint(doc);
      const fp2 = computeDocumentDependencyFingerprint(doc);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // SHA256 hex
      expect(fp1).toMatch(/^[a-f0-9]+$/);
    });

    it('should compute different fingerprints for different documents', () => {
      const doc1 = createTestDocument('doc-1', 'fingerprint-abc');
      const doc2 = createTestDocument('doc-2', 'fingerprint-xyz');

      const fp1 = computeDocumentDependencyFingerprint(doc1);
      const fp2 = computeDocumentDependencyFingerprint(doc2);

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('computeChunkDependencyFingerprint', () => {
    it('should compute consistent fingerprint for chunk', () => {
      const chunk = createTestChunk('chunk-1', 'doc-1', 'fp-chunk');
      const fp1 = computeChunkDependencyFingerprint(chunk);
      const fp2 = computeChunkDependencyFingerprint(chunk);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('should include span in fingerprint computation', () => {
      const chunk1 = createTestChunk('chunk-1', 'doc-1', 'fp-chunk');
      const chunk2 = { ...chunk1, span: { ...chunk1.span, startLine: 2 } };

      const fp1 = computeChunkDependencyFingerprint(chunk1);
      const fp2 = computeChunkDependencyFingerprint(chunk2);

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('computeNodeDependencyFingerprint', () => {
    it('should compute consistent fingerprint for node', () => {
      const node = createTestNode('node-1', 'doc-1', 'fp-node');
      const fp1 = computeNodeDependencyFingerprint(node);
      const fp2 = computeNodeDependencyFingerprint(node);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });
  });
});

// ============================================================================
// Dependency Validation Tests
// ============================================================================

describe('Dependency Validation', () => {
  it('should validate matching fingerprint', () => {
    const dep: UORCacheDependency = {
      kind: 'document',
      id: 'doc-1',
      uorFingerprint: 'abc123' as UORFingerprint,
    };

    const lookup = createMockLookup({ docFingerprint: 'abc123' as UORFingerprint });
    const result = validateDependency(dep, lookup, 1000);

    expect(result.valid).toBe(true);
    expect(result.currentFingerprint).toBe('abc123');
    expect(result.validatedAt).toBe(1000);
    expect(result.error).toBeUndefined();
  });

  it('should invalidate mismatched fingerprint', () => {
    const dep: UORCacheDependency = {
      kind: 'document',
      id: 'doc-1',
      uorFingerprint: 'abc123' as UORFingerprint,
    };

    const lookup = createMockLookup({ docFingerprint: 'xyz789' as UORFingerprint });
    const result = validateDependency(dep, lookup, 1000);

    expect(result.valid).toBe(false);
    expect(result.currentFingerprint).toBe('xyz789');
    expect(result.error).toContain('Fingerprint mismatch');
  });

  it('should invalidate missing dependency', () => {
    const dep: UORCacheDependency = {
      kind: 'document',
      id: 'doc-1',
      uorFingerprint: 'abc123' as UORFingerprint,
    };

    const lookup = createMockLookup({}); // No fingerprint returned
    const result = validateDependency(dep, lookup, 1000);

    expect(result.valid).toBe(false);
    expect(result.currentFingerprint).toBeUndefined();
    expect(result.error).toContain('not found');
  });

  it('should pass-through unvalidated kinds', () => {
    const dep: UORCacheDependency = {
      kind: 'failure-memory',
      id: 'fm-1',
      uorFingerprint: 'abc123' as UORFingerprint,
    };

    const lookup = createMockLookup({});
    const result = validateDependency(dep, lookup, 1000);

    expect(result.valid).toBe(true); // Pass-through
    expect(result.error).toBeUndefined();
  });
});

// ============================================================================
// Cache Entry Validation Tests
// ============================================================================

describe('Cache Entry Validation', () => {
  it('should validate cache entry with all valid dependencies', () => {
    const deps: UORCacheDependency[] = [
      { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-doc-1' as UORFingerprint },
      { kind: 'chunk', id: 'chunk-1', uorFingerprint: 'fp-chunk-1' as UORFingerprint },
    ];
    const entry = createTestCacheEntry('cache-1', deps, 'fresh');

    const lookup = createMockLookup({
      docFingerprint: 'fp-doc-1' as UORFingerprint,
      chunkFingerprint: 'fp-chunk-1' as UORFingerprint,
    });

    const result = validateCacheEntry(entry, lookup, { now: 1000 });

    expect(result.valid).toBe(true);
    expect(result.action).toBe('use');
    expect(result.staleDependencyCount).toBe(0);
    expect(result.missingDependencyCount).toBe(0);
    expect(result.dependencyResults).toHaveLength(2);
    expect(result.validatedAt).toBe(1000);
  });

  it('should invalidate cache entry with stale dependency', () => {
    const deps: UORCacheDependency[] = [
      { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-old' as UORFingerprint },
    ];
    const entry = createTestCacheEntry('cache-1', deps, 'fresh');

    const lookup = createMockLookup({
      docFingerprint: 'fp-new' as UORFingerprint, // Changed!
    });

    const result = validateCacheEntry(entry, lookup, { now: 1000 });

    expect(result.valid).toBe(false);
    expect(result.action).toBe('invalidate');
    expect(result.staleDependencyCount).toBe(1);
    expect(result.missingDependencyCount).toBe(0);
  });

  it('should invalidate cache entry with missing dependency', () => {
    const deps: UORCacheDependency[] = [
      { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-doc-1' as UORFingerprint },
    ];
    const entry = createTestCacheEntry('cache-1', deps, 'fresh');

    const lookup = createMockLookup({}); // Document not found

    const result = validateCacheEntry(entry, lookup, { now: 1000 });

    expect(result.valid).toBe(false);
    expect(result.action).toBe('invalidate');
    expect(result.staleDependencyCount).toBe(0);
    expect(result.missingDependencyCount).toBe(1);
  });

  it('should mark already-stale entry as invalid', () => {
    const deps: UORCacheDependency[] = [
      { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-doc-1' as UORFingerprint },
    ];
    const entry = createTestCacheEntry('cache-1', deps, 'stale');

    const lookup = createMockLookup({
      docFingerprint: 'fp-doc-1' as UORFingerprint,
    });

    const result = validateCacheEntry(entry, lookup, { now: 1000 });

    expect(result.valid).toBe(false);
    expect(result.action).toBe('invalidate');
    expect(result.governance.state).toBe('deprecated');
  });

  it('should handle empty dependency list as valid', () => {
    const entry = createTestCacheEntry('cache-1', [], 'fresh');
    const lookup = createMockLookup({});

    const result = validateCacheEntry(entry, lookup, { now: 1000 });

    expect(result.valid).toBe(true);
    expect(result.action).toBe('use');
  });

  it('should fail closed on legacy dependencies without fingerprints', () => {
    const deps = [
      { kind: 'document' as const, id: 'doc-1' }, // No uorFingerprint
    ];
    const entry = createTestCacheEntry('cache-1', deps as UORCacheDependency[], 'fresh');
    const lookup = createMockLookup({ docFingerprint: 'fp-doc-1' as UORFingerprint });

    const result = validateCacheEntry(entry, lookup, { failClosed: true, now: 1000 });

    expect(result.valid).toBe(false);
    expect(result.action).toBe('invalidate');
    expect(result.missingDependencyCount).toBe(1);
  });

  it('should allow legacy dependencies when failClosed is false', () => {
    const deps = [
      { kind: 'document' as const, id: 'doc-1' }, // No uorFingerprint
    ];
    const entry = createTestCacheEntry('cache-1', deps as UORCacheDependency[], 'fresh');
    const lookup = createMockLookup({});

    const result = validateCacheEntry(entry, lookup, { failClosed: false, now: 1000 });

    expect(result.valid).toBe(true); // Passes because no validation attempted
    expect(result.action).toBe('use');
  });
});

// ============================================================================
// Batch Validation Tests
// ============================================================================

describe('Batch Cache Validation', () => {
  it('should validate multiple cache entries', () => {
    const entries: CacheEntryRecord[] = [
      createTestCacheEntry('cache-1', [
        { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-1' as UORFingerprint },
      ], 'fresh'),
      createTestCacheEntry('cache-2', [
        { kind: 'document', id: 'doc-2', uorFingerprint: 'fp-2' as UORFingerprint },
      ], 'fresh'),
    ];

    const lookup = createMockLookup({
      docFingerprint: 'fp-1' as UORFingerprint, // Only doc-1 exists
    });

    const results = validateCacheEntries(entries, lookup, { now: 1000 });

    expect(results).toHaveLength(2);
    expect(results[0].valid).toBe(true); // cache-1 valid
    expect(results[1].valid).toBe(false); // cache-2 missing
  });
});

// ============================================================================
// Legacy Compatibility Tests
// ============================================================================

describe('Legacy Cache Staleness', () => {
  it('should find stale cache by ID matching', () => {
    const cacheEntries: CacheEntryRecord[] = [
      createTestCacheEntry('cache-1', [
        { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-1' as UORFingerprint },
        { kind: 'chunk', id: 'chunk-1', uorFingerprint: 'fp-2' as UORFingerprint },
      ], 'fresh'),
      createTestCacheEntry('cache-2', [
        { kind: 'document', id: 'doc-2', uorFingerprint: 'fp-3' as UORFingerprint },
      ], 'fresh'),
    ];

    const changedRefs = [{ kind: 'document' as const, id: 'doc-1' }];
    const staleIds = findStaleCacheIdsLegacy(cacheEntries, changedRefs);

    expect(staleIds).toContain('cache-1');
    expect(staleIds).not.toContain('cache-2');
  });

  it('should return empty when no changes', () => {
    const cacheEntries: CacheEntryRecord[] = [
      createTestCacheEntry('cache-1', [
        { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-1' as UORFingerprint },
      ], 'fresh'),
    ];

    const staleIds = findStaleCacheIdsLegacy(cacheEntries, []);
    expect(staleIds).toHaveLength(0);
  });
});

// ============================================================================
// Migration Tests
// ============================================================================

describe('UOR Migration', () => {
  describe('migrateDependencyToUOR', () => {
    it('should migrate document dependency with fingerprint', () => {
      const dep = { kind: 'document' as const, id: 'doc-1' };
      const lookup = createMockLookup({ docFingerprint: 'fp-1' as UORFingerprint });

      const migrated = migrateDependencyToUOR(dep, lookup);

      expect(migrated).not.toBeNull();
      expect(migrated?.uorFingerprint).toBe('fp-1');
      expect(migrated?.kind).toBe('document');
      expect(migrated?.id).toBe('doc-1');
    });

    it('should return null for missing dependency', () => {
      const dep = { kind: 'document' as const, id: 'doc-1' };
      const lookup = createMockLookup({}); // No fingerprint

      const migrated = migrateDependencyToUOR(dep, lookup);

      expect(migrated).toBeNull();
    });

    it('should return null for unmapped kinds', () => {
      const dep = { kind: 'failure-memory' as const, id: 'fm-1' };
      const lookup = createMockLookup({});

      const migrated = migrateDependencyToUOR(dep, lookup);

      expect(migrated).toBeNull();
    });
  });

  describe('migrateCacheEntryToUOR', () => {
    it('should migrate cache entry with migratable dependencies', () => {
      const entry = createTestCacheEntry('cache-1', [
        { kind: 'document', id: 'doc-1', uorFingerprint: 'legacy-fp' as UORFingerprint },
      ], 'fresh');

      const lookup = createMockLookup({
        docFingerprint: 'new-fp' as UORFingerprint,
      });

      const migrated = migrateCacheEntryToUOR(entry, lookup);

      expect(migrated.dependencyRefs).toHaveLength(1);
      expect((migrated.dependencyRefs[0] as UORCacheDependency).uorFingerprint).toBe('new-fp');
    });

    it('should skip unmigratable dependencies', () => {
      const entry = createTestCacheEntry('cache-1', [
        { kind: 'document', id: 'doc-1', uorFingerprint: 'fp-1' as UORFingerprint },
        { kind: 'failure-memory', id: 'fm-1', uorFingerprint: 'fp-2' as UORFingerprint },
      ], 'fresh');

      const lookup = createMockLookup({
        docFingerprint: 'new-fp' as UORFingerprint,
      });

      const migrated = migrateCacheEntryToUOR(entry, lookup);

      // Only document gets migrated, failure-memory is skipped
      expect(migrated.dependencyRefs).toHaveLength(1);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('UOR Cache Validation Integration', () => {
  it('should perform full validation flow', () => {
    // 1. Create documents with fingerprints
    const doc1 = createTestDocument('doc-1', 'content-hash-1');
    const doc2 = createTestDocument('doc-2', 'content-hash-2');

    // 2. Compute their UOR fingerprints
    const fp1 = computeDocumentDependencyFingerprint(doc1);
    const fp2 = computeDocumentDependencyFingerprint(doc2);

    // 3. Create cache entry depending on both
    const cacheEntry = createTestCacheEntry('cache-1', [
      { kind: 'document', id: 'doc-1', uorFingerprint: fp1 },
      { kind: 'document', id: 'doc-2', uorFingerprint: fp2 },
    ], 'fresh');

    // 4. Create lookup that returns current fingerprints (simulating store)
    const lookup: FingerprintLookup = {
      getDocumentFingerprint: (id: string) => {
        if (id === 'doc-1') return fp1;
        if (id === 'doc-2') return fp2;
        return undefined;
      },
      getChunkFingerprint: () => undefined,
      getNodeFingerprint: () => undefined,
    };

    // 5. Validate - should be valid
    const result1 = validateCacheEntry(cacheEntry, lookup);
    expect(result1.valid).toBe(true);
    expect(result1.action).toBe('use');

    // 6. Simulate document change by modifying lookup
    const changedLookup: FingerprintLookup = {
      getDocumentFingerprint: (id: string) => {
        if (id === 'doc-1') return fp1; // Unchanged
        if (id === 'doc-2') return 'changed-fp' as UORFingerprint; // Changed!
        return undefined;
      },
      getChunkFingerprint: () => undefined,
      getNodeFingerprint: () => undefined,
    };

    // 7. Validate again - should detect staleness
    const result2 = validateCacheEntry(cacheEntry, changedLookup);
    expect(result2.valid).toBe(false);
    expect(result2.action).toBe('invalidate');
    expect(result2.staleDependencyCount).toBe(1);
    expect(result2.dependencyResults[1].error).toContain('Fingerprint mismatch');
  });

  it('should maintain deterministic behavior across runs', () => {
    const doc = createTestDocument('doc-1', 'stable-content');
    const fp1 = computeDocumentDependencyFingerprint(doc);
    const fp2 = computeDocumentDependencyFingerprint(doc);
    const fp3 = computeDocumentDependencyFingerprint(doc);

    expect(fp1).toBe(fp2);
    expect(fp2).toBe(fp3);
  });
});
