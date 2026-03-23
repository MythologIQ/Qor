import { readFileSync } from 'node:fs';

import type {
  ContradictionRecord,
  EpistemicType,
  GovernanceMetadata,
  GovernanceState,
  RecallDecision,
} from './types';

type GovernedArtifactKind =
  | 'sourceDocument'
  | 'sourceChunk'
  | 'semanticNode'
  | 'semanticEdge'
  | 'cacheEntry';

interface MemoryGovernancePolicy {
  version: string;
  defaults: Record<GovernedArtifactKind, {
    state: GovernanceState;
    epistemicType: EpistemicType;
    provenanceComplete: boolean;
    confidence: number;
  }>;
  promotion: {
    requireProvenanceComplete: boolean;
    durableThresholds: number;
  };
  recall: {
    requireProvenanceForGroundedMode: boolean;
    groundedModeRequiresChunkEvidence: boolean;
    advisoryOnMissingInformation: boolean;
    advisoryOnContradiction: boolean;
    blockWhenNoEvidence: boolean;
    staleCacheMayDriveGroundedMode: boolean;
  };
}

function loadMemoryGovernancePolicy(): MemoryGovernancePolicy {
  const policyUrl = new URL('./memory-governance-policy.json', import.meta.url);
  return JSON.parse(readFileSync(policyUrl, 'utf8')) as MemoryGovernancePolicy;
}

const MEMORY_GOVERNANCE_POLICY = loadMemoryGovernancePolicy();

export const MEMORY_GOVERNANCE_POLICY_VERSION = MEMORY_GOVERNANCE_POLICY.version;

function clampConfidence(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeConfidenceProfile(
  profile: GovernanceMetadata['confidenceProfile'] | undefined,
  fallback: number,
): NonNullable<GovernanceMetadata['confidenceProfile']> {
  if (!profile) {
    return {
      extraction: fallback,
      grounding: fallback,
      crossSource: fallback,
      operational: fallback,
    };
  }

  return {
    extraction: clampConfidence(profile.extraction, fallback),
    grounding: clampConfidence(profile.grounding, fallback),
    crossSource: clampConfidence(profile.crossSource, fallback),
    operational: clampConfidence(profile.operational, fallback),
  };
}

function deriveConfidenceAggregate(profile: NonNullable<GovernanceMetadata['confidenceProfile']>): number {
  return (
    profile.extraction
    + profile.grounding
    + profile.crossSource
    + profile.operational
  ) / 4;
}

export function createGovernanceMetadata(
  artifactKind: GovernedArtifactKind | undefined,
  overrides: Partial<GovernanceMetadata> = {},
): GovernanceMetadata {
  const artifactDefaults = artifactKind
    ? MEMORY_GOVERNANCE_POLICY.defaults[artifactKind]
    : undefined;
  const baseConfidence = clampConfidence(overrides.confidence, artifactDefaults?.confidence ?? 0.5);
  const confidenceProfile = normalizeConfidenceProfile(overrides.confidenceProfile, baseConfidence);
  const confidence = overrides.confidenceProfile
    ? deriveConfidenceAggregate(confidenceProfile)
    : baseConfidence;

  return {
    state: overrides.state ?? artifactDefaults?.state ?? 'provisional',
    epistemicType: overrides.epistemicType ?? artifactDefaults?.epistemicType ?? 'synthesis',
    provenanceComplete: overrides.provenanceComplete ?? artifactDefaults?.provenanceComplete ?? false,
    confidence,
    confidenceProfile,
    policyVersion: overrides.policyVersion ?? MEMORY_GOVERNANCE_POLICY_VERSION,
    rationale: overrides.rationale,
  };
}

export function buildRecallDecision(input: {
  chunkHitCount: number;
  semanticNodeCount: number;
  contradictions: ContradictionRecord[];
  missingInformation: string[];
}): RecallDecision {
  if (MEMORY_GOVERNANCE_POLICY.recall.blockWhenNoEvidence
    && input.chunkHitCount === 0
    && input.semanticNodeCount === 0) {
    return {
      allowed: false,
      mode: 'blocked',
      reason: 'No grounded evidence is available for recall.',
      blockers: ['no-evidence'],
    };
  }

  const blockers: string[] = [];

  if (MEMORY_GOVERNANCE_POLICY.recall.advisoryOnContradiction && input.contradictions.length > 0) {
    blockers.push('contradictions-present');
  }

  if (MEMORY_GOVERNANCE_POLICY.recall.advisoryOnMissingInformation && input.missingInformation.length > 0) {
    blockers.push('missing-information');
  }

  if (MEMORY_GOVERNANCE_POLICY.recall.groundedModeRequiresChunkEvidence && input.chunkHitCount === 0) {
    blockers.push('no-chunk-evidence');
  }

  if (blockers.length > 0) {
    return {
      allowed: true,
      mode: 'advisory',
      reason: 'Recall is allowed only in advisory mode because the evidence is incomplete or contested.',
      blockers,
    };
  }

  return {
    allowed: true,
    mode: 'grounded',
    reason: 'Recall is grounded by source evidence with no unresolved contradictions in the result set.',
    blockers: [],
  };
}

export function isDurableCandidate(metadata: GovernanceMetadata): boolean {
  const thresholds = MEMORY_GOVERNANCE_POLICY.promotion.durableThresholds;

  return (!MEMORY_GOVERNANCE_POLICY.promotion.requireProvenanceComplete || metadata.provenanceComplete)
    && metadata.state === 'durable'
    && metadata.confidence >= thresholds
    && metadata.epistemicType !== 'conjecture';
}

export function withGovernanceState(
  metadata: GovernanceMetadata | undefined,
  state: GovernanceState,
  rationale?: string,
): GovernanceMetadata {
  return {
    ...(metadata ?? createGovernanceMetadata(undefined)),
    state,
    rationale: rationale ?? metadata?.rationale,
  };
}

export function withEpistemicType(
  metadata: GovernanceMetadata | undefined,
  epistemicType: EpistemicType,
  rationale?: string,
): GovernanceMetadata {
  return {
    ...(metadata ?? createGovernanceMetadata(undefined)),
    epistemicType,
    rationale: rationale ?? metadata?.rationale,
  };
}
