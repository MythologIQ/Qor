/**
 * Tests for quarantine governance gate
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateGate,
  evaluateGateBatch,
  createSourceTrustMetadata,
  applyConfidenceCap,
  isAdmissible,
  requiresQuarantine,
  describePolicy,
  CONFIDENCE_CAPS,
  DEFAULT_CONFIDENCE,
  DEFAULT_GATE_POLICY,
  STRICT_GATE_POLICY,
  PERMISSIVE_GATE_POLICY,
  type GateDecision,
  type GatePolicy,
  type SourceTrustTier,
} from './quarantine-gate.js';
import type { ScanResult, ScanVerdict, ScanDetail } from './types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockScanResult(
  verdict: ScanVerdict,
  score: number,
  details: ScanDetail[] = [],
): ScanResult {
  return {
    verdict,
    score,
    details,
    scannedAt: Date.now(),
  };
}

function createMockDetail(category: ScanDetail['category'], severity: ScanDetail['severity']): ScanDetail {
  return {
    category,
    matched: true,
    severity,
  };
}

// ============================================================================
// Confidence Caps Tests
// ============================================================================

describe('CONFIDENCE_CAPS', () => {
  it('has correct caps for all trust tiers', () => {
    expect(CONFIDENCE_CAPS.internal).toBe(0.95);
    expect(CONFIDENCE_CAPS['internal-generated']).toBe(0.90);
    expect(CONFIDENCE_CAPS['external-verified']).toBe(0.75);
    expect(CONFIDENCE_CAPS['external-untrusted']).toBe(0.50);
  });
});

describe('DEFAULT_CONFIDENCE', () => {
  it('has correct defaults for all trust tiers', () => {
    expect(DEFAULT_CONFIDENCE.internal).toBe(0.85);
    expect(DEFAULT_CONFIDENCE['internal-generated']).toBe(0.75);
    expect(DEFAULT_CONFIDENCE['external-verified']).toBe(0.60);
    expect(DEFAULT_CONFIDENCE['external-untrusted']).toBe(0.30);
  });
});

// ============================================================================
// Gate Policy Tests
// ============================================================================

describe('DEFAULT_GATE_POLICY', () => {
  it('has correct production thresholds', () => {
    expect(DEFAULT_GATE_POLICY.name).toBe('production');
    expect(DEFAULT_GATE_POLICY.suspiciousThreshold).toBe(30);
    expect(DEFAULT_GATE_POLICY.hostileThreshold).toBe(70);
    expect(DEFAULT_GATE_POLICY.autoSanitize).toBe(true);
    expect(DEFAULT_GATE_POLICY.allowHostileAdmit).toBe(false);
  });

  it('has 7-day quarantine expiry', () => {
    expect(DEFAULT_GATE_POLICY.quarantineExpiryMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('STRICT_GATE_POLICY', () => {
  it('has stricter thresholds', () => {
    expect(STRICT_GATE_POLICY.name).toBe('strict');
    expect(STRICT_GATE_POLICY.suspiciousThreshold).toBe(15);
    expect(STRICT_GATE_POLICY.hostileThreshold).toBe(50);
    expect(STRICT_GATE_POLICY.autoSanitize).toBe(false);
  });
});

describe('PERMISSIVE_GATE_POLICY', () => {
  it('has relaxed thresholds', () => {
    expect(PERMISSIVE_GATE_POLICY.name).toBe('permissive');
    expect(PERMISSIVE_GATE_POLICY.suspiciousThreshold).toBe(50);
    expect(PERMISSIVE_GATE_POLICY.hostileThreshold).toBe(85);
    expect(PERMISSIVE_GATE_POLICY.autoSanitize).toBe(true);
  });
});

describe('describePolicy', () => {
  it('returns readable description', () => {
    const desc = describePolicy(DEFAULT_GATE_POLICY);
    expect(desc).toContain('production');
    expect(desc).toContain('suspicious≥30');
    expect(desc).toContain('hostile≥70');
    expect(desc).toContain('auto-sanitize=true');
  });
});

// ============================================================================
// evaluateGate - Clean Content Tests
// ============================================================================

describe('evaluateGate - clean content', () => {
  it('admits clean internal content with high confidence', () => {
    const scanResult = createMockScanResult('clean', 0);
    const decision = evaluateGate(scanResult, 'internal', 'test content');

    expect(decision.action).toBe('admit');
    expect(decision.confidenceCap).toBe(0.95);
    expect(decision.requiresReview).toBe(false);
    expect(decision.recommendedGovernanceState).toBe('durable');
    expect(decision.recommendedEpistemicType).toBe('source-claim');
  });

  it('admits clean internal-generated content with generated epistemic type', () => {
    const scanResult = createMockScanResult('clean', 5);
    const decision = evaluateGate(scanResult, 'internal-generated', 'test content');

    expect(decision.action).toBe('admit');
    expect(decision.confidenceCap).toBe(0.90);
    expect(decision.recommendedEpistemicType).toBe('inferred-relation');
    expect(decision.recommendedGovernanceState).toBe('durable');
  });

  it('admits clean external-verified content with lower cap', () => {
    const scanResult = createMockScanResult('clean', 10);
    const decision = evaluateGate(scanResult, 'external-verified', 'test content');

    expect(decision.action).toBe('admit');
    expect(decision.confidenceCap).toBe(0.75);
    expect(decision.recommendedGovernanceState).toBe('durable');
  });

  it('admits clean external-untrusted content as provisional', () => {
    const scanResult = createMockScanResult('clean', 15);
    const decision = evaluateGate(scanResult, 'external-untrusted', 'test content');

    expect(decision.action).toBe('admit');
    expect(decision.confidenceCap).toBe(0.50);
    expect(decision.recommendedGovernanceState).toBe('provisional');
    expect(decision.recommendedEpistemicType).toBe('source-claim');
  });
});

// ============================================================================
// evaluateGate - Suspicious Content Tests
// ============================================================================

describe('evaluateGate - suspicious content', () => {
  it('sanitize-admits low-suspicion content with auto-sanitize', () => {
    const scanResult = createMockScanResult('suspicious', 35);
    const decision = evaluateGate(scanResult, 'external-untrusted', 'test content');

    expect(decision.action).toBe('sanitize-admit');
    expect(decision.confidenceCap).toBe(0.50); // capped at min(0.50, 0.50) = 0.50
    expect(decision.requiresReview).toBe(false);
    expect(decision.recommendedGovernanceState).toBe('provisional');
    expect(decision.sanitizedContent).toBe('test content');
  });

  it('quarantines high-suspicion content near hostile threshold', () => {
    const scanResult = createMockScanResult('suspicious', 55); // > 70 * 0.7 = 49
    const decision = evaluateGate(scanResult, 'external-untrusted', 'test content');

    expect(decision.action).toBe('quarantine');
    expect(decision.requiresReview).toBe(true);
    expect(decision.recommendedGovernanceState).toBe('quarantined');
    expect(decision.confidenceCap).toBeLessThanOrEqual(0.30);
  });

  it('quarantines suspicious content under strict policy', () => {
    const scanResult = createMockScanResult('suspicious', 25);
    const decision = evaluateGate(scanResult, 'external-untrusted', 'test content', STRICT_GATE_POLICY);

    expect(decision.action).toBe('quarantine');
    expect(STRICT_GATE_POLICY.autoSanitize).toBe(false);
    expect(decision.requiresReview).toBe(true);
  });

  it('uses correct confidence cap for suspicious internal content', () => {
    const scanResult = createMockScanResult('suspicious', 35);
    const decision = evaluateGate(scanResult, 'internal', 'test content');

    expect(decision.action).toBe('sanitize-admit');
    // Cap should be min(0.95, 0.50) = 0.50 for sanitize-admit
    expect(decision.confidenceCap).toBe(0.50);
  });
});

// ============================================================================
// evaluateGate - Hostile Content Tests
// ============================================================================

describe('evaluateGate - hostile content', () => {
  it('rejects hostile content under default policy', () => {
    const scanResult = createMockScanResult('hostile', 75);
    const decision = evaluateGate(scanResult, 'external-untrusted', 'malicious content');

    expect(decision.action).toBe('reject');
    expect(decision.confidenceCap).toBe(0);
    expect(decision.requiresReview).toBe(false);
    expect(decision.recommendedGovernanceState).toBe('rejected');
    expect(decision.reason).toContain('Permanently blocked');
  });

  it('rejects hostile internal content', () => {
    const scanResult = createMockScanResult('hostile', 80);
    const decision = evaluateGate(scanResult, 'internal', 'malicious content');

    expect(decision.action).toBe('reject');
    expect(decision.confidenceCap).toBe(0);
  });

  it('includes scan score in rejection reason', () => {
    const scanResult = createMockScanResult('hostile', 85);
    const decision = evaluateGate(scanResult, 'external-untrusted', 'malicious content');

    expect(decision.reason).toContain('85');
    expect(decision.reason).toContain('Hostile');
    expect(decision.audit.scanScore).toBe(85);
  });
});

// ============================================================================
// Audit Record Tests
// ============================================================================

describe('GateDecision audit records', () => {
  it('includes gate version in all decisions', () => {
    const clean = evaluateGate(createMockScanResult('clean', 0), 'internal', 'test');
    const suspicious = evaluateGate(createMockScanResult('suspicious', 35), 'internal', 'test');
    const hostile = evaluateGate(createMockScanResult('hostile', 75), 'internal', 'test');

    expect(clean.audit.gateVersion).toBe('1.0.0');
    expect(suspicious.audit.gateVersion).toBe('1.0.0');
    expect(hostile.audit.gateVersion).toBe('1.0.0');
  });

  it('includes decidedAt timestamp', () => {
    const before = Date.now();
    const decision = evaluateGate(createMockScanResult('clean', 0), 'internal', 'test');
    const after = Date.now();

    expect(decision.audit.decidedAt).toBeGreaterThanOrEqual(before);
    expect(decision.audit.decidedAt).toBeLessThanOrEqual(after);
  });

  it('includes scan score and trust tier', () => {
    const decision = evaluateGate(createMockScanResult('suspicious', 42), 'external-verified', 'test');

    expect(decision.audit.scanScore).toBe(42);
    expect(decision.audit.trustTier).toBe('external-verified');
    expect(decision.audit.appliedPolicy).toBe('production');
  });

  it('includes confidenceBeforeCap for admit and sanitize-admit', () => {
    const clean = evaluateGate(createMockScanResult('clean', 0), 'internal', 'test');
    expect(clean.audit.confidenceBeforeCap).toBeUndefined(); // Not applicable for clean

    const suspicious = evaluateGate(createMockScanResult('suspicious', 35), 'internal', 'test');
    expect(suspicious.audit.confidenceBeforeCap).toBe(0.50);
  });
});

// ============================================================================
// createSourceTrustMetadata Tests
// ============================================================================

describe('createSourceTrustMetadata', () => {
  it('creates complete metadata for external-untrusted', () => {
    const scanResult = createMockScanResult('suspicious', 35, [
      createMockDetail('prompt-injection-literal', 'critical'),
    ]);

    const metadata = createSourceTrustMetadata('external-untrusted', 'moltbook', 'post-123', scanResult);

    expect(metadata.tier).toBe('external-untrusted');
    expect(metadata.origin).toBe('moltbook');
    expect(metadata.originId).toBe('post-123');
    expect(metadata.scanVerdict).toBe('suspicious');
    expect(metadata.scanDetails).toHaveLength(1);
    expect(metadata.confidenceCap).toBe(0.50);
    expect(metadata.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
  });

  it('creates metadata without originId when undefined', () => {
    const scanResult = createMockScanResult('clean', 0);
    const metadata = createSourceTrustMetadata('internal', 'workspace', undefined, scanResult);

    expect(metadata.originId).toBeUndefined();
    expect(metadata.tier).toBe('internal');
  });
});

// ============================================================================
// applyConfidenceCap Tests
// ============================================================================

describe('applyConfidenceCap', () => {
  it('caps confidence at threshold', () => {
    const metadata = {
      state: 'durable' as const,
      epistemicType: 'source-claim' as const,
      provenanceComplete: true,
      confidence: 0.95,
      policyVersion: '1.0',
    };

    const capped = applyConfidenceCap(metadata, 0.50);
    expect(capped.confidence).toBe(0.50);
  });

  it('preserves original confidence when below cap', () => {
    const metadata = {
      state: 'durable' as const,
      epistemicType: 'source-claim' as const,
      provenanceComplete: true,
      confidence: 0.40,
      policyVersion: '1.0',
    };

    const capped = applyConfidenceCap(metadata, 0.50);
    expect(capped.confidence).toBe(0.40);
  });

  it('uses default 0.5 when confidence not provided', () => {
    const metadata = {
      state: 'durable' as const,
      epistemicType: 'source-claim' as const,
      provenanceComplete: true,
      policyVersion: '1.0',
    };

    const capped = applyConfidenceCap(metadata, 0.30);
    expect(capped.confidence).toBe(0.30); // min(0.5, 0.3) = 0.3
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('isAdmissible', () => {
  it('returns true for admit action', () => {
    expect(isAdmissible('admit')).toBe(true);
  });

  it('returns true for sanitize-admit action', () => {
    expect(isAdmissible('sanitize-admit')).toBe(true);
  });

  it('returns false for quarantine action', () => {
    expect(isAdmissible('quarantine')).toBe(false);
  });

  it('returns false for reject action', () => {
    expect(isAdmissible('reject')).toBe(false);
  });
});

describe('requiresQuarantine', () => {
  it('returns true only for quarantine action', () => {
    expect(requiresQuarantine('quarantine')).toBe(true);
    expect(requiresQuarantine('admit')).toBe(false);
    expect(requiresQuarantine('sanitize-admit')).toBe(false);
    expect(requiresQuarantine('reject')).toBe(false);
  });
});

// ============================================================================
// Batch Processing Tests
// ============================================================================

describe('evaluateGateBatch', () => {
  it('processes multiple items', () => {
    const items = [
      { scanResult: createMockScanResult('clean', 0), trustTier: 'internal' as SourceTrustTier, content: 'clean' },
      { scanResult: createMockScanResult('suspicious', 35), trustTier: 'internal' as SourceTrustTier, content: 'suspicious' },
      { scanResult: createMockScanResult('hostile', 75), trustTier: 'external-untrusted' as SourceTrustTier, content: 'hostile' },
    ];

    const result = evaluateGateBatch(items);

    expect(result.decisions).toHaveLength(3);
    expect(result.admitted).toBe(1);
    expect(result.sanitized).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.quarantined).toBe(0);
  });

  it('counts items requiring review', () => {
    const items = [
      { scanResult: createMockScanResult('clean', 0), trustTier: 'internal' as SourceTrustTier, content: 'clean' },
      { scanResult: createMockScanResult('suspicious', 55), trustTier: 'internal' as SourceTrustTier, content: 'high-suspicion' },
      { scanResult: createMockScanResult('hostile', 75), trustTier: 'external-untrusted' as SourceTrustTier, content: 'hostile' },
    ];

    const result = evaluateGateBatch(items);

    expect(result.requiresReview).toBe(1); // Only the high-suspicion one
  });

  it('respects custom policy', () => {
    const items = [
      { scanResult: createMockScanResult('suspicious', 20), trustTier: 'internal' as SourceTrustTier, content: 'suspicious' },
    ];

    // Under strict policy (suspiciousThreshold=15), score 20 should quarantine
    const strictResult = evaluateGateBatch(items, STRICT_GATE_POLICY);
    expect(strictResult.quarantined).toBe(1);

    // Under permissive policy (suspiciousThreshold=50), score 20 should sanitize-admit
    const permissiveResult = evaluateGateBatch(items, PERMISSIVE_GATE_POLICY);
    expect(permissiveResult.sanitized).toBe(1);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('handles boundary score for suspicious threshold', () => {
    const atThreshold = evaluateGate(
      createMockScanResult('suspicious', DEFAULT_GATE_POLICY.suspiciousThreshold),
      'internal',
      'test',
    );
    expect(atThreshold.action).toBe('sanitize-admit');
  });

  it('handles boundary score for hostile threshold', () => {
    const atThreshold = evaluateGate(
      createMockScanResult('hostile', DEFAULT_GATE_POLICY.hostileThreshold),
      'internal',
      'test',
    );
    expect(atThreshold.action).toBe('reject');
  });

  it('high-suspicion scores quarantine regardless of auto-sanitize', () => {
    // 0.7 * 70 = 49, so score >= 50 should quarantine
    const atBoundary = evaluateGate(
      createMockScanResult('suspicious', 50),
      'internal',
      'test',
      DEFAULT_GATE_POLICY,
    );
    expect(atBoundary.action).toBe('quarantine');
    expect(atBoundary.requiresReview).toBe(true);
  });
});
