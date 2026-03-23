import { describe, it, expect } from 'bun:test';
import {
  type SourceTrustLevel,
  type SourceTrustMetadata,
  type TrustSaturationMapping,
  DEFAULT_TRUST_SATURATION,
  createSourceTrustMetadata,
  getInitialSaturationForTrust,
  initializeStateFromTrust,
  inferTrustLevel,
  promoteTrustLevel,
  demoteTrustLevel,
  trustLevelRequiresApproval,
  inspectSourceTrust,
  updateTrustMetadata,
} from './source-trust';

describe('Source Trust - Trust Level Taxonomy', () => {
  it('should create trust metadata for unverified external source', () => {
    const metadata = createSourceTrustMetadata(
      'unverified-external',
      'https://example.com/article'
    );
    
    expect(metadata.trustLevel).toBe('unverified-external');
    expect(metadata.source).toBe('https://example.com/article');
    expect(metadata.createdAt).toBeGreaterThan(0);
    expect(metadata.rationale).toContain('unverified-external');
  });
  
  it('should create trust metadata for quarantined source', () => {
    const metadata = createSourceTrustMetadata(
      'quarantined',
      'external-untrusted-feed',
      {
        quarantineStatus: 'pending',
        rationale: 'External content under adversarial scan',
      }
    );
    
    expect(metadata.trustLevel).toBe('quarantined');
    expect(metadata.quarantineStatus).toBe('pending');
    expect(metadata.rationale).toContain('adversarial scan');
  });
  
  it('should create trust metadata for user-reviewed source', () => {
    const metadata = createSourceTrustMetadata(
      'user-reviewed',
      'https://docs.example.com',
      {
        reviewedBy: 'user-123',
        rationale: 'User confirmed content accuracy',
      }
    );
    
    expect(metadata.trustLevel).toBe('user-reviewed');
    expect(metadata.reviewedBy).toBe('user-123');
  });
  
  it('should create trust metadata for cross-verified source', () => {
    const metadata = createSourceTrustMetadata(
      'cross-verified',
      'https://api.service.com/data',
      {
        verifiedBy: ['source-a', 'source-b', 'source-c'],
        rationale: 'Content verified by 3 independent sources',
      }
    );
    
    expect(metadata.trustLevel).toBe('cross-verified');
    expect(metadata.verifiedBy).toHaveLength(3);
  });
  
  it('should create trust metadata for grounded workspace artifact', () => {
    const metadata = createSourceTrustMetadata(
      'grounded-artifact',
      '/workspace/projects/victor/kernel.ts'
    );
    
    expect(metadata.trustLevel).toBe('grounded-artifact');
    expect(metadata.source).toContain('workspace');
  });
  
  it('should create trust metadata for canonical system record', () => {
    const metadata = createSourceTrustMetadata(
      'canonical-record',
      '.qore/projects/victor-resident/ledger.jsonl'
    );
    
    expect(metadata.trustLevel).toBe('canonical-record');
    expect(metadata.source).toContain('ledger');
  });
});

describe('Source Trust - Initial Saturation Mapping', () => {
  it('should map unverified-external to zero saturation', () => {
    const saturation = getInitialSaturationForTrust('unverified-external');
    expect(saturation).toBe(0.0);
  });
  
  it('should map quarantined to zero saturation', () => {
    const saturation = getInitialSaturationForTrust('quarantined');
    expect(saturation).toBe(0.0);
  });
  
  it('should map user-reviewed to moderate saturation', () => {
    const saturation = getInitialSaturationForTrust('user-reviewed');
    expect(saturation).toBe(0.35);
  });
  
  it('should map cross-verified to high saturation', () => {
    const saturation = getInitialSaturationForTrust('cross-verified');
    expect(saturation).toBe(0.65);
  });
  
  it('should map grounded-artifact to strong saturation', () => {
    const saturation = getInitialSaturationForTrust('grounded-artifact');
    expect(saturation).toBe(0.85);
  });
  
  it('should map canonical-record to near-certain saturation', () => {
    const saturation = getInitialSaturationForTrust('canonical-record');
    expect(saturation).toBe(0.95);
  });
  
  it('should use custom saturation mapping when provided', () => {
    const customMapping: TrustSaturationMapping = {
      'unverified-external': 0.1,
      'quarantined': 0.0,
      'user-reviewed': 0.5,
      'cross-verified': 0.8,
      'grounded-artifact': 0.9,
      'canonical-record': 1.0,
    };
    
    expect(getInitialSaturationForTrust('user-reviewed', customMapping)).toBe(0.5);
    expect(getInitialSaturationForTrust('canonical-record', customMapping)).toBe(1.0);
  });
});

describe('Source Trust - Thermodynamic State Initialization', () => {
  it('should initialize state with trust-derived saturation for unverified source', () => {
    const metadata = createSourceTrustMetadata('unverified-external', 'https://example.com');
    const state = initializeStateFromTrust(metadata);
    
    expect(state.saturation).toBe(0.0);
    expect(state.temperature).toBe(1.0);  // High temperature (volatile)
    expect(state.effectiveLambda).toBeGreaterThan(0);  // Full decay
    expect(state.accessCount).toBe(0);
  });
  
  it('should initialize state with trust-derived saturation for grounded artifact', () => {
    const metadata = createSourceTrustMetadata('grounded-artifact', '/workspace/file.ts');
    const state = initializeStateFromTrust(metadata);
    
    expect(state.saturation).toBe(0.85);
    expect(state.temperature).toBeLessThan(0.2);  // Low temperature (stable)
    expect(state.effectiveLambda).toBeLessThan(0.15);  // Low decay
  });
  
  it('should initialize state with trust-derived saturation for canonical record', () => {
    const metadata = createSourceTrustMetadata('canonical-record', 'ledger.jsonl');
    const state = initializeStateFromTrust(metadata);
    
    expect(state.saturation).toBe(0.95);
    expect(state.temperature).toBeLessThan(0.1);  // Very low temperature
    expect(state.effectiveLambda).toBeLessThan(0.05);  // Minimal decay
  });
  
  it('should initialize state with trust-derived saturation for cross-verified source', () => {
    const metadata = createSourceTrustMetadata(
      'cross-verified',
      'https://api.example.com',
      { verifiedBy: ['source-a', 'source-b'] }
    );
    const state = initializeStateFromTrust(metadata);
    
    expect(state.saturation).toBe(0.65);
    expect(state.temperature).toBe(0.35);
    expect(state.accessCount).toBe(0);
  });
});

describe('Source Trust - Trust Level Inference', () => {
  it('should infer canonical-record for system records', () => {
    const trustLevel = inferTrustLevel('ledger.jsonl', {
      isCanonicalRecord: true,
    });
    expect(trustLevel).toBe('canonical-record');
  });
  
  it('should infer grounded-artifact for workspace files', () => {
    const trustLevel = inferTrustLevel('/workspace/projects/file.ts', {
      isWorkspaceArtifact: true,
    });
    expect(trustLevel).toBe('grounded-artifact');
  });
  
  it('should infer cross-verified for multi-source content', () => {
    const trustLevel = inferTrustLevel('https://example.com', {
      verificationSources: ['source-a', 'source-b', 'source-c'],
    });
    expect(trustLevel).toBe('cross-verified');
  });
  
  it('should infer user-reviewed for reviewed content', () => {
    const trustLevel = inferTrustLevel('https://docs.example.com', {
      userReviewed: true,
    });
    expect(trustLevel).toBe('user-reviewed');
  });
  
  it('should infer quarantined for pending quarantine content', () => {
    const trustLevel = inferTrustLevel('external-feed', {
      quarantineStatus: 'pending',
    });
    expect(trustLevel).toBe('quarantined');
  });
  
  it('should infer unverified-external by default', () => {
    const trustLevel = inferTrustLevel('https://random-site.com');
    expect(trustLevel).toBe('unverified-external');
  });
});

describe('Source Trust - Trust Level Promotion', () => {
  it('should promote unverified to cross-verified with 2+ sources', () => {
    const promoted = promoteTrustLevel('unverified-external', ['source-a', 'source-b']);
    expect(promoted).toBe('cross-verified');
  });
  
  it('should promote unverified to user-reviewed with 1 source', () => {
    const promoted = promoteTrustLevel('unverified-external', ['user-review']);
    expect(promoted).toBe('user-reviewed');
  });
  
  it('should promote quarantined to cross-verified after multi-source verification', () => {
    const promoted = promoteTrustLevel('quarantined', ['source-a', 'source-b']);
    expect(promoted).toBe('cross-verified');
  });
  
  it('should not promote canonical-record', () => {
    const promoted = promoteTrustLevel('canonical-record', ['source-a', 'source-b']);
    expect(promoted).toBe('canonical-record');
  });
  
  it('should not promote grounded-artifact', () => {
    const promoted = promoteTrustLevel('grounded-artifact', ['source-a', 'source-b']);
    expect(promoted).toBe('grounded-artifact');
  });
  
  it('should not promote without verification sources', () => {
    const promoted = promoteTrustLevel('unverified-external', []);
    expect(promoted).toBe('unverified-external');
  });
});

describe('Source Trust - Trust Level Demotion', () => {
  it('should demote to quarantined on quarantine event', () => {
    const demoted = demoteTrustLevel('user-reviewed', 'quarantine');
    expect(demoted).toBe('quarantined');
  });
  
  it('should demote to unverified on verification failure', () => {
    const demoted = demoteTrustLevel('cross-verified', 'verification-failed');
    expect(demoted).toBe('unverified-external');
  });
  
  it('should demote to unverified on policy violation', () => {
    const demoted = demoteTrustLevel('user-reviewed', 'policy-violation');
    expect(demoted).toBe('unverified-external');
  });
});

describe('Source Trust - Approval Requirements', () => {
  it('should require approval for unverified-external', () => {
    expect(trustLevelRequiresApproval('unverified-external')).toBe(true);
  });
  
  it('should require approval for quarantined', () => {
    expect(trustLevelRequiresApproval('quarantined')).toBe(true);
  });
  
  it('should require approval for user-reviewed', () => {
    expect(trustLevelRequiresApproval('user-reviewed')).toBe(true);
  });
  
  it('should not require approval for cross-verified', () => {
    expect(trustLevelRequiresApproval('cross-verified')).toBe(false);
  });
  
  it('should not require approval for grounded-artifact', () => {
    expect(trustLevelRequiresApproval('grounded-artifact')).toBe(false);
  });
  
  it('should not require approval for canonical-record', () => {
    expect(trustLevelRequiresApproval('canonical-record')).toBe(false);
  });
});

describe('Source Trust - Trust Inspection', () => {
  it('should inspect trust metadata and return complete status', () => {
    const metadata = createSourceTrustMetadata(
      'cross-verified',
      'https://api.example.com',
      {
        verifiedBy: ['source-a', 'source-b'],
        rationale: 'Multi-source verification',
      }
    );
    
    const inspection = inspectSourceTrust(metadata);
    
    expect(inspection.trustLevel).toBe('cross-verified');
    expect(inspection.initialSaturation).toBe(0.65);
    expect(inspection.requiresApproval).toBe(false);
    expect(inspection.source).toBe('https://api.example.com');
    expect(inspection.verificationCount).toBe(2);
    expect(inspection.reviewed).toBe(false);
    expect(inspection.quarantined).toBe(false);
    expect(inspection.rationale).toContain('Multi-source');
  });
  
  it('should inspect user-reviewed content', () => {
    const metadata = createSourceTrustMetadata(
      'user-reviewed',
      'https://docs.example.com',
      { reviewedBy: 'user-123' }
    );
    
    const inspection = inspectSourceTrust(metadata);
    
    expect(inspection.trustLevel).toBe('user-reviewed');
    expect(inspection.initialSaturation).toBe(0.35);
    expect(inspection.requiresApproval).toBe(true);
    expect(inspection.reviewed).toBe(true);
    expect(inspection.verificationCount).toBe(0);
  });
  
  it('should inspect quarantined content', () => {
    const metadata = createSourceTrustMetadata(
      'quarantined',
      'external-feed',
      { quarantineStatus: 'pending' }
    );
    
    const inspection = inspectSourceTrust(metadata);
    
    expect(inspection.trustLevel).toBe('quarantined');
    expect(inspection.initialSaturation).toBe(0.0);
    expect(inspection.requiresApproval).toBe(true);
    expect(inspection.quarantined).toBe(true);
  });
});

describe('Source Trust - Metadata Updates', () => {
  it('should update metadata on verification event', () => {
    const original = createSourceTrustMetadata('unverified-external', 'https://example.com');
    
    const updated = updateTrustMetadata(original, {
      type: 'verify',
      verificationSources: ['source-a', 'source-b'],
      reason: 'Multi-source verification completed',
    });
    
    expect(updated.trustLevel).toBe('cross-verified');
    expect(updated.verifiedBy).toEqual(['source-a', 'source-b']);
    expect(updated.rationale).toContain('Multi-source');
  });
  
  it('should update metadata on review event', () => {
    const original = createSourceTrustMetadata('unverified-external', 'https://example.com');
    
    const updated = updateTrustMetadata(original, {
      type: 'review',
      reviewedBy: 'user-123',
      reason: 'User confirmed accuracy',
    });
    
    expect(updated.trustLevel).toBe('user-reviewed');
    expect(updated.reviewedBy).toBe('user-123');
  });
  
  it('should update metadata on quarantine event', () => {
    const original = createSourceTrustMetadata('user-reviewed', 'https://example.com');
    
    const updated = updateTrustMetadata(original, {
      type: 'quarantine',
      quarantineStatus: 'pending',
      reason: 'Adversarial scan triggered',
    });
    
    expect(updated.trustLevel).toBe('quarantined');
    expect(updated.quarantineStatus).toBe('pending');
  });
  
  it('should update metadata on promote event', () => {
    const original = createSourceTrustMetadata('user-reviewed', 'https://example.com');
    
    const updated = updateTrustMetadata(original, {
      type: 'promote',
      verificationSources: ['source-a', 'source-b', 'source-c'],
      reason: 'Additional verification sources acquired',
    });
    
    expect(updated.trustLevel).toBe('cross-verified');
  });
  
  it('should update metadata on demote event', () => {
    const original = createSourceTrustMetadata('cross-verified', 'https://example.com');
    
    const updated = updateTrustMetadata(original, {
      type: 'demote',
      reason: 'verification-failed',
    });
    
    expect(updated.trustLevel).toBe('unverified-external');
  });
});

describe('Source Trust - Acceptance Criteria', () => {
  it('AC1: Input metadata captures explicit source trust level', () => {
    const metadata = createSourceTrustMetadata(
      'grounded-artifact',
      '/workspace/projects/victor/kernel.ts',
      { rationale: 'Workspace file with deterministic provenance' }
    );
    
    // Explicit trust level stored
    expect(metadata.trustLevel).toBe('grounded-artifact');
    
    // Source provenance captured
    expect(metadata.source).toContain('workspace');
    
    // Governance rationale explicit
    expect(metadata.rationale).toContain('provenance');
    
    // Timestamp for audit trail
    expect(metadata.createdAt).toBeGreaterThan(0);
  });
  
  it('AC2: Initial saturation derives from provenance trust instead of flat default', () => {
    // Unverified source: zero saturation
    const unverifiedMeta = createSourceTrustMetadata('unverified-external', 'https://example.com');
    const unverifiedState = initializeStateFromTrust(unverifiedMeta);
    expect(unverifiedState.saturation).toBe(0.0);
    
    // User-reviewed: moderate saturation
    const reviewedMeta = createSourceTrustMetadata('user-reviewed', 'https://docs.example.com');
    const reviewedState = initializeStateFromTrust(reviewedMeta);
    expect(reviewedState.saturation).toBe(0.35);
    
    // Grounded artifact: high saturation
    const groundedMeta = createSourceTrustMetadata('grounded-artifact', '/workspace/file.ts');
    const groundedState = initializeStateFromTrust(groundedMeta);
    expect(groundedState.saturation).toBe(0.85);
    
    // Canonical record: near-certain saturation
    const canonicalMeta = createSourceTrustMetadata('canonical-record', 'ledger.jsonl');
    const canonicalState = initializeStateFromTrust(canonicalMeta);
    expect(canonicalState.saturation).toBe(0.95);
    
    // All different: saturation NOT flat
    const saturations = [
      unverifiedState.saturation,
      reviewedState.saturation,
      groundedState.saturation,
      canonicalState.saturation,
    ];
    const uniqueSaturations = new Set(saturations);
    expect(uniqueSaturations.size).toBe(4);  // All distinct
  });
  
  it('AC3: Trust level is carried through governance and audit surfaces', () => {
    const metadata = createSourceTrustMetadata(
      'cross-verified',
      'https://api.example.com',
      {
        verifiedBy: ['source-a', 'source-b'],
        rationale: 'Multi-source verification',
      }
    );
    
    // Inspection surface exposes trust level
    const inspection = inspectSourceTrust(metadata);
    expect(inspection.trustLevel).toBe('cross-verified');
    expect(inspection.requiresApproval).toBe(false);
    expect(inspection.verificationCount).toBe(2);
    
    // Governance rationale preserved
    expect(inspection.rationale).toContain('Multi-source');
    
    // Trust-driven saturation visible
    expect(inspection.initialSaturation).toBe(0.65);
    
    // Approval requirement derived from trust
    expect(trustLevelRequiresApproval(metadata.trustLevel)).toBe(false);
  });
});
