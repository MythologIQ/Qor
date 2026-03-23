import { describe, expect, it } from 'bun:test';

import { buildRecallDecision, createGovernanceMetadata, isDurableCandidate } from './governance';

describe('memory governance primitives', () => {
  it('creates provisional governance metadata by default', () => {
    const metadata = createGovernanceMetadata(undefined);

    expect(metadata.state).toBe('provisional');
    expect(metadata.epistemicType).toBe('synthesis');
    expect(metadata.policyVersion).toBe('2026-03-17.v2');
  });

  it('classifies strong observed artifacts as durable candidates', () => {
    const durable = isDurableCandidate(createGovernanceMetadata(undefined, {
      state: 'durable',
      epistemicType: 'observation',
      provenanceComplete: true,
      confidence: 0.84,
    }));

    expect(durable).toBe(true);
  });

  it('loads artifact-specific defaults from policy', () => {
    const metadata = createGovernanceMetadata('sourceDocument');

    expect(metadata.state).toBe('durable');
    expect(metadata.epistemicType).toBe('observation');
    expect(metadata.provenanceComplete).toBe(true);
    expect(metadata.confidence).toBe(0.91);
    expect(metadata.confidenceProfile).toEqual({
      extraction: 0.91,
      grounding: 0.91,
      crossSource: 0.91,
      operational: 0.91,
    });
  });

  it('derives aggregate confidence from a structured confidence profile', () => {
    const metadata = createGovernanceMetadata('semanticNode', {
      confidenceProfile: {
        extraction: 0.9,
        grounding: 0.8,
        crossSource: 0.7,
        operational: 0.6,
      },
    });

    expect(metadata.confidence).toBeCloseTo(0.75, 8);
    expect(metadata.confidenceProfile).toEqual({
      extraction: 0.9,
      grounding: 0.8,
      crossSource: 0.7,
      operational: 0.6,
    });
  });

  it('downgrades recall to advisory when contradictions are present', () => {
    const decision = buildRecallDecision({
      chunkHitCount: 1,
      semanticNodeCount: 2,
      contradictions: [
        {
          key: 'memory-choice',
          kind: 'disagreement',
          nodeIds: ['n1', 'n2'],
          documentIds: ['doc-1', 'doc-2'],
          summaries: ['Use Neo4j', 'Use DuckDB'],
          sourceLabels: [],
        },
      ],
      missingInformation: [],
    });

    expect(decision.mode).toBe('advisory');
    expect(decision.blockers).toContain('contradictions-present');
  });

  it('downgrades recall to advisory when semantic nodes exist without chunk evidence', () => {
    const decision = buildRecallDecision({
      chunkHitCount: 0,
      semanticNodeCount: 1,
      contradictions: [],
      missingInformation: [],
    });

    expect(decision.mode).toBe('advisory');
    expect(decision.blockers).toContain('no-chunk-evidence');
  });
});
