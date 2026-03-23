import { describe, expect, it } from 'bun:test';

import {
  archiveQueryFailureIfNeeded,
  reconcileFailureMemoryIfPossible,
  createFailureMemoryRecord,
  extractUnresolvedNegativeConstraints,
} from './failure-memory';
import type { LearningStore } from './store';

describe('failure memory', () => {
  it('creates governed negative-memory records for failures', () => {
    const record = createFailureMemoryRecord({
      projectId: 'victor',
      summary: 'Semantic retrieval collapsed contradictory authority claims.',
      failureMode: 'LOGIC_ERROR',
      sourceDocumentId: 'doc-1',
      sourceChunkId: 'chunk-1',
      causalVector: 'contradiction flattening',
      negativeConstraint: 'AVOID: collapsing contradictory authority claims into one answer',
    });

    expect(record.remediationStatus).toBe('UNRESOLVED');
    expect(record.governance?.state).toBe('durable');
    expect(record.governance?.provenanceComplete).toBe(true);
    expect(record.negativeConstraint).toContain('AVOID:');
  });

  it('archives advisory query failures into failure memory', async () => {
    const archived: unknown[] = [];
    const store = {
      async appendFailureMemory(record) {
        archived.push(record);
      },
    } as Pick<LearningStore, 'appendFailureMemory'> as LearningStore;

    const result = await archiveQueryFailureIfNeeded(store, {
      projectId: 'victor',
      query: 'authority model',
      bundle: {
        query: 'authority model',
        chunkHits: [],
        semanticNodes: [],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        missingInformation: ['No matching source chunks were found for this query.'],
        recommendedNextActions: ['Ingest the relevant workspace files before relying on this query.'],
        recallDecision: {
          allowed: true,
          mode: 'advisory',
          reason: 'Recall is advisory.',
          blockers: ['missing-information'],
        },
      },
    });

    expect(result).not.toBeNull();
    expect(archived).toHaveLength(1);
  });

  it('extracts unresolved negative constraints without duplicating them', () => {
    const constraints = extractUnresolvedNegativeConstraints({
      missingInformation: [
        'Unresolved negative constraint: AVOID: collapsing contradictory authority claims into one answer',
        'No matching source chunks were found for this query.',
        'Unresolved negative constraint: AVOID: collapsing contradictory authority claims into one answer',
        'Unresolved negative constraint: REQUIRE: retrieve canonical authority docs before answering',
      ],
    });

    expect(constraints).toEqual([
      'AVOID: collapsing contradictory authority claims into one answer',
      'REQUIRE: retrieve canonical authority docs before answering',
    ]);
  });

  it('prefers unresolved negative constraints over generic next actions when archiving failures', async () => {
    const archived: any[] = [];
    const store = {
      async appendFailureMemory(record) {
        archived.push(record);
      },
    } as Pick<LearningStore, 'appendFailureMemory'> as LearningStore;

    await archiveQueryFailureIfNeeded(store, {
      projectId: 'victor',
      query: 'authority model',
      bundle: {
        query: 'authority model',
        chunkHits: [],
        semanticNodes: [],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        missingInformation: [
          'Unresolved negative constraint: AVOID: collapsing contradictory authority claims into one answer',
        ],
        recommendedNextActions: ['Ingest the relevant workspace files before relying on this query.'],
        recallDecision: {
          allowed: true,
          mode: 'advisory',
          reason: 'Recall is advisory.',
          blockers: ['missing-information'],
        },
      },
    });

    expect(archived).toHaveLength(1);
    expect(archived[0]?.negativeConstraint).toBe('AVOID: collapsing contradictory authority claims into one answer');
  });

  it('reconciles resolved governing-decision constraints when grounded evidence now exists', async () => {
    const remediations: Array<{ negativeConstraint: string; remediationStatus: string }> = [];
    let cacheRefreshes = 0;
    const store = {
      async remediateFailureMemories(_projectId, options) {
        remediations.push({
          negativeConstraint: options.negativeConstraint,
          remediationStatus: options.remediationStatus,
        });
        return 2;
      },
      async listFailureMemory() {
        return [];
      },
      async markNegativeConstraintSummaryStale() {
        cacheRefreshes += 1;
      },
      async upsertCacheEntries() {
        cacheRefreshes += 1;
      },
    } as Pick<LearningStore, 'remediateFailureMemories' | 'listFailureMemory' | 'markNegativeConstraintSummaryStale' | 'upsertCacheEntries'> as LearningStore;

    const count = await reconcileFailureMemoryIfPossible(store, {
      projectId: 'victor-research',
      query: 'What is the authority model?',
      bundle: {
        query: 'What is the authority model?',
        chunkHits: [],
        semanticNodes: [
          {
            id: 'decision-1',
            documentId: 'doc-1',
            sourceChunkId: 'chunk-1',
            nodeType: 'Decision',
            label: 'Victor is the resident semantic authority for Zo-Qore',
            summary: 'Victor is the resident semantic authority for Zo-Qore',
            fingerprint: 'fp',
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
            attributes: {},
            state: 'active',
          },
        ],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        missingInformation: [],
        recommendedNextActions: [],
        recallDecision: {
          allowed: true,
          mode: 'grounded',
          reason: 'Grounded.',
          blockers: [],
        },
      },
    });

    expect(count).toBe(2);
    expect(remediations).toEqual([
      {
        negativeConstraint: 'Capture the governing decision explicitly in a workspace artifact.',
        remediationStatus: 'RESOLVED',
      },
    ]);
    expect(cacheRefreshes).toBe(1);
  });

  it('does not archive a fresh failure when advisory mode is driven only by a now-resolved constraint', async () => {
    const archived: unknown[] = [];
    const remediations: Array<{ negativeConstraint: string; remediationStatus: string }> = [];
    const store = {
      async appendFailureMemory(record) {
        archived.push(record);
      },
      async remediateFailureMemories(_projectId, options) {
        remediations.push({
          negativeConstraint: options.negativeConstraint,
          remediationStatus: options.remediationStatus,
        });
        return 3;
      },
      async listFailureMemory() {
        return [];
      },
      async markNegativeConstraintSummaryStale() {},
      async upsertCacheEntries() {},
    } as Pick<
      LearningStore,
      'appendFailureMemory' | 'remediateFailureMemories' | 'listFailureMemory' | 'markNegativeConstraintSummaryStale' | 'upsertCacheEntries'
    > as LearningStore;

    const result = await archiveQueryFailureIfNeeded(store, {
      projectId: 'victor-research',
      query: 'What is the authority model?',
      bundle: {
        query: 'What is the authority model?',
        chunkHits: [],
        semanticNodes: [
          {
            id: 'decision-1',
            documentId: 'doc-1',
            sourceChunkId: 'chunk-1',
            nodeType: 'Decision',
            label: 'Victor is the resident semantic authority for Zo-Qore',
            summary: 'Victor is the resident semantic authority for Zo-Qore',
            fingerprint: 'fp',
            span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
            attributes: {},
            state: 'active',
          },
        ],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        missingInformation: [
          'Unresolved negative constraint: Capture the governing decision explicitly in a workspace artifact.',
        ],
        recommendedNextActions: ['Honor unresolved failure constraint: Capture the governing decision explicitly in a workspace artifact.'],
        recallDecision: {
          allowed: true,
          mode: 'advisory',
          reason: 'Recall is advisory.',
          blockers: ['missing-information'],
        },
      },
    });

    expect(result).toBeNull();
    expect(archived).toHaveLength(0);
    expect(remediations).toEqual([
      {
        negativeConstraint: 'Capture the governing decision explicitly in a workspace artifact.',
        remediationStatus: 'RESOLVED',
      },
    ]);
  });

  it('reconciles stale contradiction-review constraints when the current bundle contains no contradictions', async () => {
    const remediations: Array<{ negativeConstraint: string; remediationStatus: string }> = [];
    let cacheRefreshes = 0;
    const store = {
      async remediateFailureMemories(_projectId, options) {
        remediations.push({
          negativeConstraint: options.negativeConstraint,
          remediationStatus: options.remediationStatus,
        });
        return 1;
      },
      async listFailureMemory() {
        return [];
      },
      async markNegativeConstraintSummaryStale() {
        cacheRefreshes += 1;
      },
      async upsertCacheEntries() {
        cacheRefreshes += 1;
      },
    } as Pick<LearningStore, 'remediateFailureMemories' | 'listFailureMemory' | 'markNegativeConstraintSummaryStale' | 'upsertCacheEntries'> as LearningStore;

    const count = await reconcileFailureMemoryIfPossible(store, {
      projectId: 'victor',
      query: 'What is Victor core memory?',
      bundle: {
        query: 'What is Victor core memory?',
        chunkHits: [],
        semanticNodes: [],
        semanticEdges: [],
        cacheEntries: [],
        contradictions: [],
        missingInformation: [
          'Unresolved negative constraint: Review the contradictory nodes and decide which source remains authoritative.',
        ],
        recommendedNextActions: [],
        recallDecision: {
          allowed: true,
          mode: 'grounded',
          reason: 'Grounded.',
          blockers: [],
        },
      },
    });

    expect(count).toBe(1);
    expect(remediations).toEqual([
      {
        negativeConstraint: 'Review the contradictory nodes and decide which source remains authoritative.',
        remediationStatus: 'RESOLVED',
      },
    ]);
    expect(cacheRefreshes).toBe(1);
  });
});
