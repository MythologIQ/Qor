import { describe, expect, it } from 'bun:test';

import { detectContradictions } from './contradictions';

describe('detectContradictions', () => {
  it('surfaces conflicting summaries for the same semantic key as disagreement', () => {
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
    expect(contradictions[0].kind).toBe('disagreement');
    expect(contradictions[0].summaries).toContain('Use Neo4j first');
    expect(contradictions[0].summaries).toContain('Use DuckDB first');
  });

  it('classifies supersession conflicts from replacement language', () => {
    const contradictions = detectContradictions([
      {
        id: 'a',
        documentId: 'doc-a',
        sourceChunkId: 'chunk-a',
        nodeType: 'Decision',
        label: 'Storage choice',
        summary: 'Neo4j supersedes the prior store for governed memory.',
        fingerprint: '1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: {},
        state: 'active',
      },
      {
        id: 'b',
        documentId: 'doc-b',
        sourceChunkId: 'chunk-b',
        nodeType: 'Decision',
        label: 'Storage choice',
        summary: 'DuckDB remains the active store for governed memory.',
        fingerprint: '2',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: {},
        state: 'active',
      },
    ]);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe('supersession');
  });

  it('classifies authority splits across research-style authority claims', () => {
    const contradictions = detectContradictions([
      {
        id: 'a',
        documentId: 'doc-a',
        sourceChunkId: 'chunk-a',
        nodeType: 'Decision',
        label: 'Canonical graph memory should rule recall',
        summary: 'Authority model: Canonical graph memory should rule recall',
        fingerprint: '1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { sourceLabel: 'Authority model' },
        state: 'active',
      },
      {
        id: 'b',
        documentId: 'doc-b',
        sourceChunkId: 'chunk-b',
        nodeType: 'Decision',
        label: 'Binding operator review should rule recall',
        summary: 'Authority model: Binding operator review should rule recall',
        fingerprint: '2',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: { sourceLabel: 'Authority model' },
        state: 'active',
      },
    ]);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe('authority-split');
    expect(contradictions[0].sourceLabels).toContain('Authority model');
    expect(contradictions[0].documentIds).toContain('doc-a');
    expect(contradictions[0].documentIds).toContain('doc-b');
  });

  it('classifies perspective shifts across labeled research claims', () => {
    const contradictions = detectContradictions([
      {
        id: 'a',
        documentId: 'doc-a',
        sourceChunkId: 'chunk-a',
        nodeType: 'Constraint',
        label: 'Prefer bounded observation before execution',
        summary: 'Problem: Prefer bounded observation before execution',
        fingerprint: '1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { sourceLabel: 'Problem' },
        state: 'active',
      },
      {
        id: 'b',
        documentId: 'doc-b',
        sourceChunkId: 'chunk-b',
        nodeType: 'Constraint',
        label: 'Prefer bounded observation before execution',
        summary: 'Unresolved Gaps: Prefer bounded observation before execution',
        fingerprint: '2',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: { sourceLabel: 'Unresolved Gaps' },
        state: 'active',
      },
    ]);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe('perspective-shift');
    expect(contradictions[0].sourceLabels).toContain('Problem');
    expect(contradictions[0].sourceLabels).toContain('Unresolved Gaps');
  });

  it('does not treat multiple proposed solutions as contradictions when they read like alternative strategies', () => {
    const contradictions = detectContradictions([
      {
        id: 'a',
        documentId: 'doc-a',
        sourceChunkId: 'chunk-a',
        nodeType: 'Goal',
        label: 'Bayesian Updating',
        summary: 'Proposed Solution: Bayesian Updating',
        fingerprint: '1',
        span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
        attributes: { sourceLabel: 'Proposed Solution' },
        state: 'active',
      },
      {
        id: 'b',
        documentId: 'doc-b',
        sourceChunkId: 'chunk-b',
        nodeType: 'Goal',
        label: 'Causal Graphs',
        summary: 'Proposed Solution: Causal Graphs',
        fingerprint: '2',
        span: { startLine: 2, endLine: 2, startOffset: 11, endOffset: 20 },
        attributes: { sourceLabel: 'Proposed Solution' },
        state: 'active',
      },
    ]);

    expect(contradictions).toHaveLength(0);
  });
});
