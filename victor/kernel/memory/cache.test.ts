import { describe, expect, it } from 'bun:test';

import {
  buildNegativeConstraintSummaryCacheEntry,
  ensureGovernedCacheEntry,
  extractNegativeConstraintSummary,
  findStaleCacheIds,
} from './cache';

describe('findStaleCacheIds', () => {
  it('marks cache entries stale when any dependency changes', () => {
    const stale = findStaleCacheIds(
      [
        {
          id: 'cache-1',
          cacheType: 'stable-summary',
          summary: 'summary',
          status: 'fresh',
          dependencyRefs: [
            { kind: 'document', id: 'doc-1' },
            { kind: 'chunk', id: 'chunk-1' },
          ],
          updatedAt: 1,
        },
        {
          id: 'cache-2',
          cacheType: 'retrieval-bundle',
          summary: 'bundle',
          status: 'fresh',
          dependencyRefs: [{ kind: 'semantic-node', id: 'node-2' }],
          updatedAt: 1,
        },
      ],
      [{ kind: 'chunk', id: 'chunk-1' }],
    );

    expect(stale).toEqual(['cache-1']);
  });

  it('applies policy-driven governance defaults to cache entries', () => {
    const entry = ensureGovernedCacheEntry({
      id: 'cache-3',
      cacheType: 'stable-summary',
      summary: 'summary',
      status: 'fresh',
      dependencyRefs: [{ kind: 'document', id: 'doc-1' }],
      updatedAt: 1,
    });

    expect(entry.purpose).toBe('stable-summary');
    expect(entry.governance?.epistemicType).toBe('synthesis');
    expect(entry.governance?.state).toBe('ephemeral');
  });

  it('preserves base governance state when cache entries are stale', () => {
    const entry = ensureGovernedCacheEntry({
      id: 'cache-4',
      cacheType: 'retrieval-bundle',
      summary: 'bundle',
      status: 'stale',
      dependencyRefs: [{ kind: 'chunk', id: 'chunk-1' }],
      updatedAt: 1,
    });

    // Governance state is not affected by entry.status staleness
    // Staleness is tracked by entry.status, governance by entry.governance.state
    expect(entry.governance?.state).toBe('ephemeral');
  });

  it('builds a project-scoped negative constraint summary cache entry', () => {
    const entry = buildNegativeConstraintSummaryCacheEntry('victor', [
      {
        id: 'failure-1',
        projectId: 'victor',
        createdAt: 1,
        summary: 'Constraint one',
        failureMode: 'LOGIC_ERROR',
        negativeConstraint: 'AVOID: collapse contradictory authority claims',
        remediationStatus: 'UNRESOLVED',
      },
      {
        id: 'failure-2',
        projectId: 'victor',
        createdAt: 2,
        summary: 'Constraint two',
        failureMode: 'SPEC_VIOLATION',
        negativeConstraint: 'REQUIRE: retrieve canonical authority docs first',
        remediationStatus: 'UNRESOLVED',
      },
    ]);

    expect(entry?.cacheType).toBe('negative-constraint-summary');
    expect(entry?.dependencyRefs).toEqual([
      { kind: 'failure-memory', id: 'failure-1' },
      { kind: 'failure-memory', id: 'failure-2' },
    ]);
    expect(entry?.summary).toContain('AVOID: collapse contradictory authority claims');
    expect(entry?.summary).toContain('REQUIRE: retrieve canonical authority docs first');
  });

  it('extracts negative constraints from a summary cache entry', () => {
    const constraints = extractNegativeConstraintSummary([
      {
        id: 'negative-constraint-summary:victor',
        cacheType: 'negative-constraint-summary',
        summary: 'AVOID: collapse contradictory authority claims\nREQUIRE: retrieve canonical authority docs first',
        status: 'fresh',
        dependencyRefs: [{ kind: 'failure-memory', id: 'failure-1' }],
        updatedAt: 1,
        purpose: 'negative-constraint-summary',
      },
    ]);

    expect(constraints).toEqual([
      'AVOID: collapse contradictory authority claims',
      'REQUIRE: retrieve canonical authority docs first',
    ]);
  });
});
