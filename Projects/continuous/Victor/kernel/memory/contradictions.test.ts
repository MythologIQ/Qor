import { describe, expect, it } from 'bun:test';

import { detectContradictions } from './contradictions';

describe('detectContradictions', () => {
  it('surfaces conflicting summaries for the same semantic key', () => {
    const contradictions = detectContradictions([
      {
        id: 'a',
        documentId: 'doc',
        sourceChunkId: 'chunk-a',
        nodeType: 'Decision',
        label: 'Storage choice',
        summary: 'Use Neo4j first',
        fingerprint: '1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: {},
        state: 'active',
      },
      {
        id: 'b',
        documentId: 'doc',
        sourceChunkId: 'chunk-b',
        nodeType: 'Decision',
        label: 'Storage choice',
        summary: 'Use DuckDB first',
        fingerprint: '2',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: {},
        state: 'active',
      },
    ]);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].summaries).toContain('Use Neo4j first');
    expect(contradictions[0].summaries).toContain('Use DuckDB first');
  });
});
