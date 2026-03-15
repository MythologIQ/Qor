import { describe, expect, it } from 'bun:test';

import { rankCacheEntries, rankChunkHits } from './rank';

describe('rank helpers', () => {
  it('orders chunk hits by score then chunk index', () => {
    const ranked = rankChunkHits([
      {
        score: 1,
        chunk: {
          id: 'b',
          documentId: 'doc',
          index: 3,
          fingerprint: 'b',
          text: 'later',
          tokenEstimate: 1,
          span: { startLine: 3, endLine: 3, startOffset: 0, endOffset: 1 },
        },
      },
      {
        score: 2,
        chunk: {
          id: 'a',
          documentId: 'doc',
          index: 10,
          fingerprint: 'a',
          text: 'best',
          tokenEstimate: 1,
          span: { startLine: 10, endLine: 10, startOffset: 0, endOffset: 1 },
        },
      },
    ]);

    expect(ranked.map((item) => item.chunk.id)).toEqual(['a', 'b']);
  });

  it('prefers cache entries that match more query terms', () => {
    const ranked = rankCacheEntries(
      [
        {
          id: 'c1',
          cacheType: 'stable-summary',
          summary: 'Victor memory kernel uses Neo4j',
          status: 'fresh',
          dependencyRefs: [],
          updatedAt: 1,
        },
        {
          id: 'c2',
          cacheType: 'stable-summary',
          summary: 'Builder Console governance',
          status: 'fresh',
          dependencyRefs: [],
          updatedAt: 1,
        },
      ],
      'victor neo4j memory',
    );

    expect(ranked[0].id).toBe('c1');
  });
});
