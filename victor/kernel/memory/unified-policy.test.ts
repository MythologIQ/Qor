/**
 * Tests for unified-policy.ts
 *
 * @module unified-policy.test
 */

import { describe, it, expect } from 'bun:test';
import {
  // Policy constants
  UNIFIED_POLICY_VERSION,
  DEFAULT_UNIFIED_POLICY,
  STRICT_UNIFIED_POLICY,
  PERMISSIVE_UNIFIED_POLICY,

  // Risk levels
  RISK_LEVEL_PRECEDENCE,
  RISK_LEVEL_DESCRIPTIONS,

  // Confidence thresholds
  DEFAULT_CONFIDENCE_THRESHOLDS,
  STRICT_CONFIDENCE_THRESHOLDS,
  PERMISSIVE_CONFIDENCE_THRESHOLDS,

  // Scan requirements
  ALL_SCAN_CATEGORIES,
  DEFAULT_SCAN_REQUIREMENTS,
  STRICT_SCAN_REQUIREMENTS,

  // Verification requirements
  DEFAULT_VERIFICATION_REQUIREMENTS,
  STRICT_VERIFICATION_REQUIREMENTS,

  // Core functions
  evaluateContentAdmission,
  evaluateActionExecution,
  getPolicyByName,
  createCustomPolicy,
  validateConfidenceThresholds,
  describePolicy,

  // Types
  type ContentAdmissionRequest,
  type ActionExecutionRequest,
  type UnifiedPolicy,
} from './unified-policy.js';

describe('Unified Policy Framework', () => {
  describe('Policy Constants', () => {
    it('should have version 1.0.0', () => {
      expect(UNIFIED_POLICY_VERSION).toBe('1.0.0');
    });

    it('should have correct risk level precedence', () => {
      expect(RISK_LEVEL_PRECEDENCE.low).toBe(1);
      expect(RISK_LEVEL_PRECEDENCE.medium).toBe(2);
      expect(RISK_LEVEL_PRECEDENCE.high).toBe(3);
    });

    it('should have risk level descriptions', () => {
      expect(RISK_LEVEL_DESCRIPTIONS.low).toContain('Read-only');
      expect(RISK_LEVEL_DESCRIPTIONS.medium).toContain('Contained writes');
      expect(RISK_LEVEL_DESCRIPTIONS.high).toContain('Multi-file');
    });
  });

  describe('Default Unified Policy', () => {
    it('should have production name', () => {
      expect(DEFAULT_UNIFIED_POLICY.name).toBe('production');
    });

    it('should have version metadata', () => {
      expect(DEFAULT_UNIFIED_POLICY.version.version).toBe(UNIFIED_POLICY_VERSION);
      expect(DEFAULT_UNIFIED_POLICY.version.createdAt).toBeDefined();
      expect(DEFAULT_UNIFIED_POLICY.version.changeSummary).toBeDefined();
    });

    it('should have correct bounds', () => {
      expect(DEFAULT_UNIFIED_POLICY.maxActionsPerTick).toBe(1);
      expect(DEFAULT_UNIFIED_POLICY.maxConsecutiveBlocked).toBe(2);
      expect(DEFAULT_UNIFIED_POLICY.maxConsecutiveFailures).toBe(2);
    });

    it('should have auto-quarantine enabled', () => {
      expect(DEFAULT_UNIFIED_POLICY.autoQuarantineSuspicious).toBe(true);
    });

    it('should require approval for high risk', () => {
      expect(DEFAULT_UNIFIED_POLICY.requireApprovalForHighRisk).toBe(true);
    });
  });

  describe('Strict Unified Policy', () => {
    it('should have strict name', () => {
      expect(STRICT_UNIFIED_POLICY.name).toBe('strict');
    });

    it('should have tighter bounds', () => {
      expect(STRICT_UNIFIED_POLICY.maxConsecutiveBlocked).toBe(1);
      expect(STRICT_UNIFIED_POLICY.maxConsecutiveFailures).toBe(1);
    });

    it('should require human review for medium risk', () => {
      expect(STRICT_UNIFIED_POLICY.verificationRequirements.medium).toContain('human_review');
    });
  });

  describe('Permissive Unified Policy', () => {
    it('should have permissive name', () => {
      expect(PERMISSIVE_UNIFIED_POLICY.name).toBe('permissive');
    });

    it('should allow more actions per tick', () => {
      expect(PERMISSIVE_UNIFIED_POLICY.maxActionsPerTick).toBe(3);
    });

    it('should not auto-quarantine', () => {
      expect(PERMISSIVE_UNIFIED_POLICY.autoQuarantineSuspicious).toBe(false);
    });
  });

  describe('Confidence Thresholds', () => {
    it('should have all trust tiers in default thresholds', () => {
      expect(DEFAULT_CONFIDENCE_THRESHOLDS.internal).toBeDefined();
      expect(DEFAULT_CONFIDENCE_THRESHOLDS['internal-generated']).toBeDefined();
      expect(DEFAULT_CONFIDENCE_THRESHOLDS['external-verified']).toBeDefined();
      expect(DEFAULT_CONFIDENCE_THRESHOLDS['external-untrusted']).toBeDefined();
    });

    it('should have all risk levels per tier', () => {
      for (const tier of Object.keys(DEFAULT_CONFIDENCE_THRESHOLDS) as Array<keyof typeof DEFAULT_CONFIDENCE_THRESHOLDS>) {
        expect(DEFAULT_CONFIDENCE_THRESHOLDS[tier].low).toBeDefined();
        expect(DEFAULT_CONFIDENCE_THRESHOLDS[tier].medium).toBeDefined();
        expect(DEFAULT_CONFIDENCE_THRESHOLDS[tier].high).toBeDefined();
      }
    });

    it('should increase thresholds with risk level', () => {
      const internal = DEFAULT_CONFIDENCE_THRESHOLDS.internal;
      expect(internal.low).toBeLessThan(internal.medium);
      expect(internal.medium).toBeLessThan(internal.high);
    });

    it('should have external-untrusted at 1.0 for high risk (blocked)', () => {
      expect(DEFAULT_CONFIDENCE_THRESHOLDS['external-untrusted'].high).toBe(1.0);
    });

    it('should have stricter thresholds in strict policy', () => {
      expect(STRICT_CONFIDENCE_THRESHOLDS.internal.low)
        .toBeGreaterThan(DEFAULT_CONFIDENCE_THRESHOLDS.internal.low);
    });

    it('should have looser thresholds in permissive policy', () => {
      expect(PERMISSIVE_CONFIDENCE_THRESHOLDS.internal.low)
        .toBeLessThan(DEFAULT_CONFIDENCE_THRESHOLDS.internal.low);
    });
  });

  describe('Scan Requirements', () => {
    it('should have 10 scan categories', () => {
      expect(ALL_SCAN_CATEGORIES.length).toBe(10);
    });

    it('should have fewer scans for internal tiers', () => {
      expect(DEFAULT_SCAN_REQUIREMENTS.internal.length).toBeLessThan(
        DEFAULT_SCAN_REQUIREMENTS['external-untrusted'].length,
      );
    });

    it('should have all scans for external-untrusted', () => {
      expect(DEFAULT_SCAN_REQUIREMENTS['external-untrusted']).toEqual(ALL_SCAN_CATEGORIES);
    });

    it('should have all scans in strict mode', () => {
      expect(STRICT_SCAN_REQUIREMENTS.internal).toEqual(ALL_SCAN_CATEGORIES);
    });
  });

  describe('Verification Requirements', () => {
    it('should require more verification for higher risk', () => {
      expect(DEFAULT_VERIFICATION_REQUIREMENTS.low.length).toBeLessThan(
        DEFAULT_VERIFICATION_REQUIREMENTS.medium.length,
      );
      expect(DEFAULT_VERIFICATION_REQUIREMENTS.medium.length).toBeLessThan(
        DEFAULT_VERIFICATION_REQUIREMENTS.high.length,
      );
    });

    it('should require human review for high risk', () => {
      expect(DEFAULT_VERIFICATION_REQUIREMENTS.high).toContain('human_review');
    });

    it('should require dual approval for high risk in strict mode', () => {
      expect(STRICT_VERIFICATION_REQUIREMENTS.high).toContain('dual_approval');
    });
  });

  describe('evaluateContentAdmission', () => {
    it('should quarantine content without scan result', () => {
      const request: ContentAdmissionRequest = {
        content: 'test content',
        trustTier: 'external-untrusted',
        origin: 'moltbook',
      };

      const decision = evaluateContentAdmission(request);

      expect(decision.verdict).toBe('quarantine');
      expect(decision.reasoning).toContain('requires scan result');
      expect(decision.missingVerifications).toContain('preflight_checks');
    });

    it('should reject hostile content', () => {
      const request: ContentAdmissionRequest = {
        content: 'malicious content',
        trustTier: 'external-untrusted',
        origin: 'moltbook',
        scanResult: {
          verdict: 'hostile',
          score: 85,
          matchedCategories: ['instruction_injection', 'jailbreak_attempt'],
        },
      };

      const decision = evaluateContentAdmission(request);

      expect(decision.verdict).toBe('reject');
      expect(decision.reasoning).toContain('Hostile');
      expect(decision.confidence).toBeGreaterThan(0.9);
    });

    it('should quarantine suspicious content by default', () => {
      const request: ContentAdmissionRequest = {
        content: 'suspicious content',
        trustTier: 'external-untrusted',
        origin: 'moltbook',
        scanResult: {
          verdict: 'suspicious',
          score: 45,
          matchedCategories: ['obfuscated_content'],
        },
      };

      const decision = evaluateContentAdmission(request);

      expect(decision.verdict).toBe('quarantine');
      expect(decision.reasoning).toContain('Suspicious');
    });

    it('should admit suspicious content in permissive mode', () => {
      const request: ContentAdmissionRequest = {
        content: 'suspicious content',
        trustTier: 'external-untrusted',
        origin: 'moltbook',
        scanResult: {
          verdict: 'suspicious',
          score: 45,
          matchedCategories: ['obfuscated_content'],
        },
      };

      const decision = evaluateContentAdmission(request, PERMISSIVE_UNIFIED_POLICY);

      expect(decision.verdict).toBe('approve');
    });

    it('should admit clean content', () => {
      const request: ContentAdmissionRequest = {
        content: 'clean content',
        trustTier: 'internal',
        origin: 'workspace',
        scanResult: {
          verdict: 'clean',
          score: 5,
          matchedCategories: [],
        },
      };

      const decision = evaluateContentAdmission(request);

      expect(decision.verdict).toBe('approve');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should approve clean content regardless of scan coverage', () => {
      const request: ContentAdmissionRequest = {
        content: 'content',
        trustTier: 'external-verified',
        origin: 'verified-source',
        scanResult: {
          verdict: 'clean',
          score: 10,
          matchedCategories: ['instruction_injection'], // Partial scan but clean verdict
        },
      };

      const decision = evaluateContentAdmission(request);

      // Clean content is approved regardless of scan coverage
      expect(decision.verdict).toBe('approve');
      expect(decision.reasoning).toContain('Clean');
    });
  });

  describe('evaluateActionExecution', () => {
    it('should approve low-risk action with all verifications', () => {
      const request: ActionExecutionRequest = {
        actionId: 'test-action',
        description: 'Test action',
        riskLevel: 'low',
        preflightPassed: true,
        groundedQueryPerformed: true,
      };

      const decision = evaluateActionExecution(request);

      expect(decision.verdict).toBe('approve');
      expect(decision.checkedVerifications).toContain('preflight_checks');
      expect(decision.checkedVerifications).toContain('grounded_query');
    });

    it('should reject high-risk action missing verifications', () => {
      const request: ActionExecutionRequest = {
        actionId: 'high-risk-action',
        description: 'High risk action',
        riskLevel: 'high',
        preflightPassed: true,
        groundedQueryPerformed: false,
        snapshotCreated: false,
      };

      const decision = evaluateActionExecution(request);

      expect(decision.verdict).toBe('reject');
      expect(decision.missingVerifications).toContain('grounded_query');
      expect(decision.missingVerifications).toContain('snapshot_backup');
    });

    it('should reject medium-risk action in strict mode missing snapshot', () => {
      const request: ActionExecutionRequest = {
        actionId: 'medium-action',
        description: 'Medium risk action',
        riskLevel: 'medium',
        preflightPassed: true,
        groundedQueryPerformed: true,
        snapshotCreated: false, // Missing required snapshot
      };

      const decision = evaluateActionExecution(request, STRICT_UNIFIED_POLICY);

      // Strict mode medium risk requires snapshot_backup
      expect(decision.verdict).toBe('reject');
      expect(decision.reasoning).toContain('snapshot_backup');
    });

    it('should use highest trust tier from sources', () => {
      const request: ActionExecutionRequest = {
        actionId: 'multi-source-action',
        description: 'Action with multiple sources',
        riskLevel: 'medium',
        sourceTrustTiers: ['internal', 'external-untrusted'],
        preflightPassed: true,
        groundedQueryPerformed: true,
        snapshotCreated: true,
      };

      const decision = evaluateActionExecution(request);

      // Should use external-untrusted thresholds (most restrictive)
      expect(decision.reasoning).toContain('external-untrusted');
    });

    it('should approve when all verifications pass', () => {
      const request: ActionExecutionRequest = {
        actionId: 'full-verification-action',
        description: 'Fully verified action',
        riskLevel: 'high',
        sourceTrustTiers: ['internal'],
        preflightPassed: true,
        groundedQueryPerformed: true,
        snapshotCreated: true,
      };

      const decision = evaluateActionExecution(request);

      expect(decision.verdict).toBe('approve');
      expect(decision.checkedVerifications.length).toBeGreaterThan(2);
    });

    it('should default to internal-generated if no sources specified', () => {
      const request: ActionExecutionRequest = {
        actionId: 'no-source-action',
        description: 'Action without sources',
        riskLevel: 'low',
        preflightPassed: true,
        groundedQueryPerformed: true,
      };

      const decision = evaluateActionExecution(request);

      expect(decision.reasoning).toContain('internal-generated');
    });
  });

  describe('getPolicyByName', () => {
    it('should return production policy', () => {
      const policy = getPolicyByName('production');
      expect(policy).toBeDefined();
      expect(policy?.name).toBe('production');
    });

    it('should return strict policy', () => {
      const policy = getPolicyByName('strict');
      expect(policy).toBeDefined();
      expect(policy?.name).toBe('strict');
    });

    it('should return permissive policy', () => {
      const policy = getPolicyByName('permissive');
      expect(policy).toBeDefined();
      expect(policy?.name).toBe('permissive');
    });

    it('should return null for unknown policy', () => {
      const policy = getPolicyByName('unknown');
      expect(policy).toBeNull();
    });
  });

  describe('createCustomPolicy', () => {
    it('should create custom policy from base', () => {
      const custom = createCustomPolicy('production', {
        name: 'custom-test',
        maxActionsPerTick: 5,
      });

      expect(custom).toBeDefined();
      expect(custom?.name).toBe('custom-test');
      expect(custom?.maxActionsPerTick).toBe(5);
      // Should inherit other values from base
      expect(custom?.autoQuarantineSuspicious).toBe(true);
    });

    it('should have version metadata linking to base', () => {
      const custom = createCustomPolicy('strict', {
        name: 'custom-strict',
      });

      expect(custom?.version.previousVersion).toBe(UNIFIED_POLICY_VERSION);
      expect(custom?.version.changeSummary).toContain('strict');
    });

    it('should return null for invalid base', () => {
      const custom = createCustomPolicy('nonexistent', {
        name: 'custom',
      });

      expect(custom).toBeNull();
    });
  });

  describe('validateConfidenceThresholds', () => {
    it('should validate correct thresholds', () => {
      const result = validateConfidenceThresholds(DEFAULT_CONFIDENCE_THRESHOLDS);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing tiers', () => {
      const invalid = {
        internal: { low: 0.5, medium: 0.7, high: 0.9 },
      } as any;

      const result = validateConfidenceThresholds(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing'))).toBe(true);
    });

    it('should reject invalid values', () => {
      const invalid = {
        internal: { low: -0.1, medium: 0.7, high: 1.5 },
        'internal-generated': { low: 0.5, medium: 0.7, high: 0.9 },
        'external-verified': { low: 0.5, medium: 0.7, high: 0.9 },
        'external-untrusted': { low: 0.5, medium: 0.7, high: 0.9 },
      } as any;

      const result = validateConfidenceThresholds(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('-0.1'))).toBe(true);
      expect(result.errors.some(e => e.includes('1.5'))).toBe(true);
    });
  });

  describe('describePolicy', () => {
    it('should include policy name and version', () => {
      const description = describePolicy(DEFAULT_UNIFIED_POLICY);
      expect(description).toContain('production');
      expect(description).toContain(UNIFIED_POLICY_VERSION);
    });

    it('should include confidence thresholds', () => {
      const description = describePolicy(DEFAULT_UNIFIED_POLICY);
      expect(description).toContain('Confidence Thresholds');
      expect(description).toContain('internal:');
    });

    it('should include scan requirements', () => {
      const description = describePolicy(DEFAULT_UNIFIED_POLICY);
      expect(description).toContain('Scan Requirements');
    });

    it('should include verification requirements', () => {
      const description = describePolicy(DEFAULT_UNIFIED_POLICY);
      expect(description).toContain('Verification Requirements');
      expect(description).toContain('low:');
      expect(description).toContain('medium:');
      expect(description).toContain('high:');
    });
  });
});
