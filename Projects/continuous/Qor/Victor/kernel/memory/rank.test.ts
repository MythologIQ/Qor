import { describe, expect, it } from 'bun:test';

import { rankCacheEntries, rankChunkHits, rankSemanticNodes } from './rank';

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

  it('boosts chunk hits that match more query terms', () => {
    const ranked = rankChunkHits(
      [
        {
          score: 2,
          chunk: {
            id: 'a',
            documentId: 'doc',
            index: 2,
            fingerprint: 'a',
            text: 'memory kernel',
            tokenEstimate: 2,
            span: { startLine: 2, endLine: 2, startOffset: 0, endOffset: 10 },
          },
        },
        {
          score: 2,
          chunk: {
            id: 'b',
            documentId: 'doc',
            index: 1,
            fingerprint: 'b',
            text: 'comms tab prompt automation task',
            tokenEstimate: 4,
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          },
        },
      ],
      'comms tab automation task',
    );

    expect(ranked[0].chunk.id).toBe('b');
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

  it('boosts semantic node types that match query intent', () => {
    const ranked = rankSemanticNodes(
      [
        {
          id: 'decision-1',
          documentId: 'doc',
          sourceChunkId: 'chunk',
          nodeType: 'Decision',
          label: 'Builder governance',
          summary: 'Builder Console governance is binding',
          fingerprint: 'decision',
          span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
          attributes: {},
          state: 'active',
        },
        {
          id: 'task-1',
          documentId: 'doc',
          sourceChunkId: 'chunk',
          nodeType: 'Task',
          label: 'Automate comms tab prompt construction',
          summary: 'Automate comms tab prompt construction',
          fingerprint: 'task',
          span: { startLine: 2, endLine: 2, startOffset: 0, endOffset: 10 },
          attributes: {},
          state: 'active',
        },
      ],
      'What task exists for comms tab prompt automation?',
    );

    expect(ranked[0].id).toBe('task-1');
  });
});
