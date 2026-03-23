import { buildNegativeConstraintSummaryCacheEntry } from './cache';
import { createGovernanceMetadata } from './governance';
import { hashContent } from './provenance';
import type { FailureMemoryRecord, FailureMode, GroundedContextBundle } from './types';
import type { LearningStore } from './store';

const UNRESOLVED_NEGATIVE_CONSTRAINT_PREFIX = 'Unresolved negative constraint:';

export function createFailureMemoryRecord(input: {
  projectId: string;
  summary: string;
  failureMode: FailureMode;
  sourceDocumentId?: string;
  sourceChunkId?: string;
  sourceNodeId?: string;
  causalVector?: string;
  negativeConstraint?: string;
  environmentContext?: string;
  remediationNotes?: string;
}): FailureMemoryRecord {
  const createdAt = Date.now();

  return {
    id: hashContent(
      input.projectId,
      input.failureMode,
      input.summary,
      input.sourceDocumentId ?? '',
      input.sourceChunkId ?? '',
      String(createdAt),
    ),
    projectId: input.projectId,
    createdAt,
    sourceDocumentId: input.sourceDocumentId,
    sourceChunkId: input.sourceChunkId,
    sourceNodeId: input.sourceNodeId,
    summary: input.summary,
    failureMode: input.failureMode,
    causalVector: input.causalVector,
    negativeConstraint: input.negativeConstraint,
    environmentContext: input.environmentContext,
    remediationStatus: 'UNRESOLVED',
    remediationNotes: input.remediationNotes,
    governance: createGovernanceMetadata(undefined, {
      state: 'durable',
      epistemicType: 'policy-ruling',
      provenanceComplete: Boolean(input.sourceDocumentId || input.sourceChunkId || input.sourceNodeId),
      confidence: 0.78,
      rationale: 'Failure memory preserves negative learning as a future constraint rather than discarding it.',
    }),
  };
}

export function extractUnresolvedNegativeConstraints(
  bundle: Pick<GroundedContextBundle, 'missingInformation'>,
): string[] {
  const seen = new Set<string>();
  const constraints: string[] = [];

  for (const item of bundle.missingInformation) {
    if (!item.startsWith(UNRESOLVED_NEGATIVE_CONSTRAINT_PREFIX)) {
      continue;
    }

    const normalized = item
      .slice(UNRESOLVED_NEGATIVE_CONSTRAINT_PREFIX.length)
      .trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    constraints.push(normalized);
  }

  return constraints;
}

export async function archiveQueryFailureIfNeeded(
  store: LearningStore,
  input: {
    projectId: string;
    query: string;
    bundle: GroundedContextBundle;
  },
): Promise<FailureMemoryRecord | null> {
  const { bundle } = input;
  const mode = bundle.recallDecision?.mode;
  const resolvedConstraints = inferResolvedNegativeConstraints(bundle);
  const unresolvedConstraints = extractUnresolvedNegativeConstraints(bundle);
  const remainingUnresolvedConstraints = unresolvedConstraints.filter(
    (constraint) => !resolvedConstraints.includes(constraint),
  );
  const nonConstraintMissingInformation = bundle.missingInformation.filter(
    (item) => !item.startsWith(UNRESOLVED_NEGATIVE_CONSTRAINT_PREFIX),
  );

  if (!mode) {
    return null;
  }

  const remediated = resolvedConstraints.length > 0
    ? await reconcileFailureMemoryIfPossible(store, input)
    : 0;

  if (mode === 'grounded') {
    return null;
  }

  if (
    remediated > 0
    && remainingUnresolvedConstraints.length === 0
    && nonConstraintMissingInformation.length === 0
    && bundle.contradictions.length === 0
  ) {
    return null;
  }

  const summary = mode === 'blocked'
    ? `Blocked grounded query: ${input.query}`
    : `Advisory grounded query: ${input.query}`;

  const failureMode: FailureMode = bundle.contradictions.length > 0
    ? 'TRUST_VIOLATION'
    : bundle.missingInformation.length > 0
      ? 'SPEC_VIOLATION'
      : 'OTHER';

  const record = createFailureMemoryRecord({
    projectId: input.projectId,
    summary,
    failureMode,
    causalVector: [
      ...bundle.contradictions.map((item) => item.key),
      ...nonConstraintMissingInformation,
      ...remainingUnresolvedConstraints.map((constraint) => `${UNRESOLVED_NEGATIVE_CONSTRAINT_PREFIX} ${constraint}`),
    ].join(' | '),
    negativeConstraint: remainingUnresolvedConstraints[0] ?? bundle.recommendedNextActions[0],
    remediationNotes: bundle.recallDecision?.reason,
  });

  await store.appendFailureMemory(record);
  return record;
}

export async function refreshNegativeConstraintSummaryCache(
  store: LearningStore,
  projectId: string,
): Promise<void> {
  const unresolvedFailureMemory = await store.listFailureMemory(projectId, 'UNRESOLVED', 250);
  const summaryEntry = buildNegativeConstraintSummaryCacheEntry(projectId, unresolvedFailureMemory);

  if (!summaryEntry) {
    await store.markNegativeConstraintSummaryStale(projectId);
    return;
  }

  await store.upsertCacheEntries([summaryEntry]);
}

export async function reconcileFailureMemoryIfPossible(
  store: LearningStore,
  input: {
    projectId: string;
    query: string;
    bundle: GroundedContextBundle;
  },
): Promise<number> {
  const resolvedConstraints = inferResolvedNegativeConstraints(input.bundle);
  if (resolvedConstraints.length === 0) {
    return 0;
  }

  let remediated = 0;
  for (const constraint of resolvedConstraints) {
    remediated += await store.remediateFailureMemories(input.projectId, {
      negativeConstraint: constraint,
      remediationStatus: 'RESOLVED',
      remediationNotes: `Grounded query superseded the prior constraint: ${input.query}`,
    });
  }

  if (remediated > 0) {
    await refreshNegativeConstraintSummaryCache(store, input.projectId);
  }

  return remediated;
}

function inferResolvedNegativeConstraints(bundle: GroundedContextBundle): string[] {
  const resolved = new Set<string>();
  const unresolvedConstraints = extractUnresolvedNegativeConstraints(bundle);

  if (bundle.semanticNodes.some((node) => node.nodeType === 'Decision')) {
    resolved.add('Capture the governing decision explicitly in a workspace artifact.');
  }

  if (
    bundle.contradictions.length === 0
    && unresolvedConstraints.includes('Review the contradictory nodes and decide which source remains authoritative.')
  ) {
    resolved.add('Review the contradictory nodes and decide which source remains authoritative.');
  }

  return [...resolved];
}
