import { describe, expect, it } from 'bun:test';

import { findStaleCacheIds } from './cache';

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
});
