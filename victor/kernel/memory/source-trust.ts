/**
 * Source Trust Levels and Provenance-Aware Initial Saturation
 * 
 * Maps source provenance into explicit trust levels so unverified,
 * user-reviewed, and verified inputs enter the memory system with
 * appropriate initial epistemic weight instead of a flat default.
 */

import type { ThermodynamicState, DecayParameters } from './thermodynamic-decay';
import { initializeThermodynamicState, DEFAULT_DECAY_PARAMS } from './thermodynamic-decay';

/**
 * Source trust level taxonomy
 * Explicit provenance classification for memory inputs
 */
export type SourceTrustLevel = 
  | 'unverified-external'       // External content, not yet verified
  | 'quarantined'              // External content under quarantine review
  | 'user-reviewed'            // User-reviewed content, not independently verified
  | 'cross-verified'           // Content verified by multiple independent sources
  | 'grounded-artifact'        // Workspace artifact with deterministic provenance
  | 'canonical-record';        // Canonical system record (governance ledger, etc.)

/**
 * Source trust metadata
 * Captures provenance details for governance and audit
 */
export interface SourceTrustMetadata {
  trustLevel: SourceTrustLevel;
  source: string;                // Source identifier (URL, file path, etc.)
  verifiedBy?: string[];         // Verification sources (for cross-verified)
  reviewedBy?: string;           // User who reviewed (for user-reviewed)
  quarantineStatus?: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  rationale: string;             // Governance rationale for trust level
}

/**
 * Trust-to-saturation mapping
 * Defines initial saturation levels for each trust tier
 */
export interface TrustSaturationMapping {
  'unverified-external': number;
  'quarantined': number;
  'user-reviewed': number;
  'cross-verified': number;
  'grounded-artifact': number;
  'canonical-record': number;
}

/**
 * Default trust-to-saturation mapping
 * Conservative initial saturation levels based on epistemic confidence
 */
export const DEFAULT_TRUST_SATURATION: TrustSaturationMapping = {
  'unverified-external': 0.0,    // Zero epistemic weight until verified
  'quarantined': 0.0,            // Quarantined content starts at zero
  'user-reviewed': 0.35,         // User review provides moderate confidence
  'cross-verified': 0.65,        // Multiple verification sources = high confidence
  'grounded-artifact': 0.85,     // Workspace artifacts have strong provenance
  'canonical-record': 0.95,      // System records are near-certain
};

/**
 * Create source trust metadata from trust level
 */
export function createSourceTrustMetadata(
  trustLevel: SourceTrustLevel,
  source: string,
  options: {
    verifiedBy?: string[];
    reviewedBy?: string;
    quarantineStatus?: 'pending' | 'approved' | 'rejected';
    rationale?: string;
  } = {}
): SourceTrustMetadata {
  return {
    trustLevel,
    source,
    verifiedBy: options.verifiedBy,
    reviewedBy: options.reviewedBy,
    quarantineStatus: options.quarantineStatus,
    createdAt: Date.now(),
    rationale: options.rationale || `Source trust level: ${trustLevel}`,
  };
}

/**
 * Get initial saturation for a given trust level
 */
export function getInitialSaturationForTrust(
  trustLevel: SourceTrustLevel,
  mapping: TrustSaturationMapping = DEFAULT_TRUST_SATURATION
): number {
  return mapping[trustLevel];
}

/**
 * Initialize thermodynamic state from source trust metadata
 * Maps provenance trust into initial saturation instead of using flat default
 */
export function initializeStateFromTrust(
  trustMetadata: SourceTrustMetadata,
  saturationMapping: TrustSaturationMapping = DEFAULT_TRUST_SATURATION,
  decayParams: DecayParameters = DEFAULT_DECAY_PARAMS
): ThermodynamicState {
  const initialSaturation = getInitialSaturationForTrust(
    trustMetadata.trustLevel,
    saturationMapping
  );
  
  return initializeThermodynamicState(initialSaturation, decayParams);
}

/**
 * Infer source trust level from provenance details
 * Automatic trust level inference from source characteristics
 */
export function inferTrustLevel(
  source: string,
  options: {
    isWorkspaceArtifact?: boolean;
    isCanonicalRecord?: boolean;
    verificationSources?: string[];
    userReviewed?: boolean;
    quarantineStatus?: 'pending' | 'approved' | 'rejected';
  } = {}
): SourceTrustLevel {
  // Canonical records (governance ledger, system state)
  if (options.isCanonicalRecord) {
    return 'canonical-record';
  }
  
  // Grounded workspace artifacts
  if (options.isWorkspaceArtifact) {
    return 'grounded-artifact';
  }
  
  // Cross-verified content (multiple independent sources)
  if (options.verificationSources && options.verificationSources.length >= 2) {
    return 'cross-verified';
  }
  
  // User-reviewed content
  if (options.userReviewed) {
    return 'user-reviewed';
  }
  
  // Quarantined content
  if (options.quarantineStatus === 'pending' || options.quarantineStatus === 'rejected') {
    return 'quarantined';
  }
  
  // Default: unverified external
  return 'unverified-external';
}

/**
 * Promote trust level after successful verification
 * Used when content earns higher trust through validation
 */
export function promoteTrustLevel(
  currentTrustLevel: SourceTrustLevel,
  newVerificationSources: string[]
): SourceTrustLevel {
  // Cannot promote canonical records or grounded artifacts
  if (currentTrustLevel === 'canonical-record' || currentTrustLevel === 'grounded-artifact') {
    return currentTrustLevel;
  }
  
  // Cross-verification requires 2+ sources
  if (newVerificationSources.length >= 2) {
    return 'cross-verified';
  }
  
  // Single verification source = user-reviewed
  if (newVerificationSources.length === 1) {
    return 'user-reviewed';
  }
  
  // No promotion without verification
  return currentTrustLevel;
}

/**
 * Demote trust level after failed verification or policy violation
 */
export function demoteTrustLevel(
  currentTrustLevel: SourceTrustLevel,
  reason: 'verification-failed' | 'policy-violation' | 'quarantine'
): SourceTrustLevel {
  // Quarantine demotes to quarantined status
  if (reason === 'quarantine') {
    return 'quarantined';
  }
  
  // Failed verification or policy violation demotes to unverified
  return 'unverified-external';
}

/**
 * Check if trust level requires approval for crystallization
 * Lower trust levels may require additional approval gates
 */
export function trustLevelRequiresApproval(
  trustLevel: SourceTrustLevel
): boolean {
  // Unverified and quarantined content always requires approval
  if (trustLevel === 'unverified-external' || trustLevel === 'quarantined') {
    return true;
  }
  
  // User-reviewed content requires approval (single verification source)
  if (trustLevel === 'user-reviewed') {
    return true;
  }
  
  // Cross-verified, grounded artifacts, and canonical records can bypass approval
  return false;
}

/**
 * Inspect source trust metadata for governance surfaces
 * Returns human-readable trust status
 */
export interface TrustInspectionResult {
  trustLevel: SourceTrustLevel;
  initialSaturation: number;
  requiresApproval: boolean;
  source: string;
  verificationCount: number;
  reviewed: boolean;
  quarantined: boolean;
  rationale: string;
}

export function inspectSourceTrust(
  trustMetadata: SourceTrustMetadata,
  saturationMapping: TrustSaturationMapping = DEFAULT_TRUST_SATURATION
): TrustInspectionResult {
  return {
    trustLevel: trustMetadata.trustLevel,
    initialSaturation: getInitialSaturationForTrust(trustMetadata.trustLevel, saturationMapping),
    requiresApproval: trustLevelRequiresApproval(trustMetadata.trustLevel),
    source: trustMetadata.source,
    verificationCount: trustMetadata.verifiedBy?.length ?? 0,
    reviewed: !!trustMetadata.reviewedBy,
    quarantined: trustMetadata.quarantineStatus === 'pending' || trustMetadata.quarantineStatus === 'rejected',
    rationale: trustMetadata.rationale,
  };
}

/**
 * Update trust metadata after verification event
 */
export function updateTrustMetadata(
  currentMetadata: SourceTrustMetadata,
  event: {
    type: 'verify' | 'review' | 'quarantine' | 'promote' | 'demote';
    verificationSources?: string[];
    reviewedBy?: string;
    quarantineStatus?: 'pending' | 'approved' | 'rejected';
    reason?: string;
  }
): SourceTrustMetadata {
  let newTrustLevel = currentMetadata.trustLevel;
  let newVerifiedBy = currentMetadata.verifiedBy;
  let newReviewedBy = currentMetadata.reviewedBy;
  let newQuarantineStatus = currentMetadata.quarantineStatus;
  
  switch (event.type) {
    case 'verify':
      newVerifiedBy = event.verificationSources;
      newTrustLevel = promoteTrustLevel(currentMetadata.trustLevel, event.verificationSources ?? []);
      break;
    
    case 'review':
      newReviewedBy = event.reviewedBy;
      if (currentMetadata.trustLevel === 'unverified-external') {
        newTrustLevel = 'user-reviewed';
      }
      break;
    
    case 'quarantine':
      newQuarantineStatus = event.quarantineStatus;
      if (event.quarantineStatus === 'pending' || event.quarantineStatus === 'rejected') {
        newTrustLevel = 'quarantined';
      }
      break;
    
    case 'promote':
      newTrustLevel = promoteTrustLevel(currentMetadata.trustLevel, event.verificationSources ?? []);
      break;
    
    case 'demote':
      newTrustLevel = demoteTrustLevel(
        currentMetadata.trustLevel,
        (event.reason as 'verification-failed' | 'policy-violation' | 'quarantine') ?? 'verification-failed'
      );
      break;
  }
  
  return {
    ...currentMetadata,
    trustLevel: newTrustLevel,
    verifiedBy: newVerifiedBy,
    reviewedBy: newReviewedBy,
    quarantineStatus: newQuarantineStatus,
    rationale: event.reason || currentMetadata.rationale,
  };
}
