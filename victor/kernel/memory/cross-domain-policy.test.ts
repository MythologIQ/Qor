/**
 * Tests for Cross-Domain Policy Enforcement
 *
 * @module cross-domain-policy.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  CrossDomainPolicyEnforcer,
  getCrossDomainPolicyEnforcer,
  setCrossDomainPolicyEnforcer,
  resetCrossDomainPolicyEnforcer,
  analyzeDecisionForCrossDomainEffects,
  checkCrossDomainActionRisk,
  checkCrossDomainContentReview,
  type CrossDomainViolation,
  type CrossDomainReviewRequirement,
} from './cross-domain-policy.js';
import {
  GovernanceDecisionEngine,
  getGovernanceDecisionEngine,
  setGovernanceDecisionEngine,
  resetGovernanceDecisionEngine,
  type DecisionRecord,
  type DecisionContext,
} from './governance-decision-engine.js';
import {
  type ContentAdmissionRequest,
  type ActionExecutionRequest,
  type GovernanceDecision,
} from './unified-policy.js';

// Helper to create a mock content admission decision
function createMockContentDecision(
  verdict: 'approve' | 'quarantine' | 'reject',
  contentId: string,
  trustTier: 'internal' | 'internal-generated' | 'external-verified' | 'external-untrusted' = 'external-untrusted',
): DecisionRecord {
  const decision: GovernanceDecision = {
    verdict,
    confidence: 0.7,
    reasoning: `Test ${verdict} decision`,
    policyVersion: '1.0.0',
    policyName: 'test',
    checkedVerifications: ['preflight_checks'],
    decidedAt: new Date().toISOString(),
  };

  const request: ContentAdmissionRequest = {
    content: 'test content',
    trustTier,
    origin: 'test',
    contentId,
  };

  const context: DecisionContext = {
    actor: 'test',
    reason: 'test',
    projectId: 'test-project',
  };

  return {
    id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type: 'content_admission',
    decision,
    context,
    request,
    policyName: 'test',
    createdAt: new Date().toISOString(),
  };
}

// Helper to create a mock action execution decision
function createMockActionDecision(
  verdict: 'approve' | 'quarantine' | 'reject',
  actionId: string,
  sourceContentIds: string[] = [],
  riskLevel: 'low' | 'medium' | 'high' = 'medium',
): DecisionRecord {
  const decision: GovernanceDecision = {
    verdict,
    confidence: 0.7,
    reasoning: `Test ${verdict} decision`,
    policyVersion: '1.0.0',
    policyName: 'test',
    checkedVerifications: ['preflight_checks', 'grounded_query'],
    decidedAt: new Date().toISOString(),
  };

  const request: ActionExecutionRequest = {
    actionId,
    description: 'test action',
    riskLevel,
    sourceContentIds,
    preflightPassed: true,
    groundedQueryPerformed: true,
  };

  const context: DecisionContext = {
    actor: 'test',
    reason: 'test',
    projectId: 'test-project',
  };

  return {
    id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type: 'action_execution',
    decision,
    context,
    request,
    policyName: 'test',
    createdAt: new Date().toISOString(),
  };
}

describe('CrossDomainPolicyEnforcer', () => {
  let enforcer: CrossDomainPolicyEnforcer;

  beforeEach(() => {
    resetCrossDomainPolicyEnforcer();
    resetGovernanceDecisionEngine();
    enforcer = getCrossDomainPolicyEnforcer();
  });

  afterEach(() => {
    resetCrossDomainPolicyEnforcer();
    resetGovernanceDecisionEngine();
  });

  describe('analyzeContentDecision', () => {
    it('should return empty array for approve decisions', () => {
      const decision = createMockContentDecision('approve', 'content-1');
      const violations = enforcer.analyzeContentDecision(decision);
      expect(violations).toHaveLength(0);
    });

    it('should create violation for reject decisions', () => {
      const decision = createMockContentDecision('reject', 'content-1', 'external-untrusted');
      const violations = enforcer.analyzeContentDecision(decision);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('content_reject_blocks_action');
      expect(violations[0].contentId).toBe('content-1');
      expect(violations[0].triggeringVerdict).toBe('reject');
      expect(violations[0].impact.actionRiskElevated).toBe(false);
    });

    it('should create violation for quarantine decisions', () => {
      const decision = createMockContentDecision('quarantine', 'content-1', 'external-untrusted');
      const violations = enforcer.analyzeContentDecision(decision);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('content_quarantine_escalates_action');
      expect(violations[0].contentId).toBe('content-1');
      expect(violations[0].triggeringVerdict).toBe('quarantine');
      expect(violations[0].impact.actionRiskElevated).toBe(true);
      expect(violations[0].impact.riskLevelAdjustment).toBe(1);
    });

    it('should create review requirements for quarantined content', () => {
      const decision = createMockContentDecision('quarantine', 'content-1');
      enforcer.analyzeContentDecision(decision);

      const requirements = enforcer.getActiveReviewRequirements();
      expect(requirements).toHaveLength(1);
      expect(requirements[0].subjectId).toBe('content-1');
      expect(requirements[0].subjectType).toBe('action');
      expect(requirements[0].severity).toBe('medium');
    });

    it('should create high severity review requirement for rejected content', () => {
      const decision = createMockContentDecision('reject', 'content-1');
      enforcer.analyzeContentDecision(decision);

      const requirements = enforcer.getActiveReviewRequirements();
      expect(requirements).toHaveLength(1);
      expect(requirements[0].severity).toBe('high');
    });
  });

  describe('analyzeActionDecision', () => {
    it('should return empty array for approve decisions', () => {
      const decision = createMockActionDecision('approve', 'action-1', ['content-1']);
      const violations = enforcer.analyzeActionDecision(decision);
      expect(violations).toHaveLength(0);
    });

    it('should create violations for rejected actions with source content', () => {
      const decision = createMockActionDecision('reject', 'action-1', ['content-1', 'content-2']);
      const violations = enforcer.analyzeActionDecision(decision);

      expect(violations).toHaveLength(2);
      expect(violations[0].type).toBe('action_reject_flags_content');
      expect(violations[0].actionId).toBe('action-1');
      expect(violations[0].contentId).toBe('content-1');
      expect(violations[0].impact.contentReviewRequired).toBe(true);
      expect(violations[0].impact.trustTierAdjustment).toBe(-1);
    });

    it('should create general failure violation for actions without source content', () => {
      const decision = createMockActionDecision('reject', 'action-1', []);
      const violations = enforcer.analyzeActionDecision(decision);

      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('action_failure_reduces_trust');
      expect(violations[0].actionId).toBe('action-1');
    });

    it('should create content review requirements for flagged content', () => {
      const decision = createMockActionDecision('reject', 'action-1', ['content-1'], 'high');
      enforcer.analyzeActionDecision(decision);

      const requirements = enforcer.getActiveReviewRequirements();
      expect(requirements.length).toBeGreaterThanOrEqual(1);
      const contentReq = requirements.find((r) => r.subjectType === 'content');
      expect(contentReq).toBeDefined();
      expect(contentReq?.subjectId).toBe('content-1');
      expect(contentReq?.severity).toBe('high');
    });
  });

  describe('checkActionRiskElevation', () => {
    it('should not elevate risk for actions with no violations', () => {
      const result = enforcer.checkActionRiskElevation('action-1', ['content-1']);
      expect(result.elevated).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('should elevate risk for actions referencing quarantined content', () => {
      // First, create a quarantine violation
      const contentDecision = createMockContentDecision('quarantine', 'content-1');
      enforcer.analyzeContentDecision(contentDecision);

      // Then check action risk
      const result = enforcer.checkActionRiskElevation('action-1', ['content-1']);
      expect(result.elevated).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain('quarantined');
    });

    it('should block actions referencing rejected content', () => {
      // First, create a reject violation
      const contentDecision = createMockContentDecision('reject', 'content-1');
      enforcer.analyzeContentDecision(contentDecision);

      // Then check action risk
      const result = enforcer.checkActionRiskElevation('action-1', ['content-1']);
      expect(result.elevated).toBe(false); // Blocked, not elevated
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain('rejected');
    });

    it('should consider action history in risk assessment', () => {
      // Create an action decision with violations
      const actionDecision = createMockActionDecision('reject', 'action-1', [], 'high');
      enforcer.analyzeActionDecision(actionDecision);

      // Check same action again
      const result = enforcer.checkActionRiskElevation('action-1', ['content-1']);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('checkContentReviewRequirement', () => {
    it('should not require review for content with no violations', () => {
      const result = enforcer.checkContentReviewRequirement('content-1');
      expect(result.reviewRequired).toBe(false);
    });

    it('should require review for content flagged by rejected actions', () => {
      // First, create an action reject violation
      const actionDecision = createMockActionDecision('reject', 'action-1', ['content-1'], 'medium');
      enforcer.analyzeActionDecision(actionDecision);

      // Then check content review requirement
      const result = enforcer.checkContentReviewRequirement('content-1');
      expect(result.reviewRequired).toBe(true);
      expect(result.severity).toBe('medium');
      expect(result.trustTierAdjustment).toBe(-1);
    });

    it('should report high severity for high-risk action rejections', () => {
      const actionDecision = createMockActionDecision('reject', 'action-1', ['content-1'], 'high');
      enforcer.analyzeActionDecision(actionDecision);

      const result = enforcer.checkContentReviewRequirement('content-1');
      expect(result.severity).toBe('high');
    });
  });

  describe('markViolationReviewed', () => {
    it('should mark violation as reviewed', () => {
      const decision = createMockContentDecision('quarantine', 'content-1');
      const violations = enforcer.analyzeContentDecision(decision);

      const result = enforcer.markViolationReviewed(violations[0].id, 'reviewer-1');
      expect(result).toBe(true);

      const reviewedViolations = enforcer.queryViolations({ reviewed: true });
      expect(reviewedViolations).toHaveLength(1);
      expect(reviewedViolations[0].reviewedBy).toBe('reviewer-1');
    });

    it('should clear related review requirements when violation is reviewed', () => {
      const decision = createMockContentDecision('quarantine', 'content-1');
      const violations = enforcer.analyzeContentDecision(decision);

      // Verify requirement exists
      expect(enforcer.getActiveReviewRequirements()).toHaveLength(1);

      // Mark reviewed
      enforcer.markViolationReviewed(violations[0].id, 'reviewer-1');

      // Verify requirement cleared
      expect(enforcer.getActiveReviewRequirements()).toHaveLength(0);
    });

    it('should return false for non-existent violation', () => {
      const result = enforcer.markViolationReviewed('non-existent', 'reviewer-1');
      expect(result).toBe(false);
    });
  });

  describe('queryViolations', () => {
    beforeEach(() => {
      // Create various violations
      const quarantineDecision = createMockContentDecision('quarantine', 'content-1');
      const rejectDecision = createMockContentDecision('reject', 'content-2');
      const actionDecision = createMockActionDecision('reject', 'action-1', ['content-3']);

      enforcer.analyzeContentDecision(quarantineDecision);
      enforcer.analyzeContentDecision(rejectDecision);
      enforcer.analyzeActionDecision(actionDecision);
    });

    it('should filter by type', () => {
      const quarantineViolations = enforcer.queryViolations({
        type: 'content_quarantine_escalates_action',
      });
      expect(quarantineViolations).toHaveLength(1);

      const rejectViolations = enforcer.queryViolations({
        type: 'content_reject_blocks_action',
      });
      expect(rejectViolations).toHaveLength(1);
    });

    it('should filter by content ID', () => {
      const violations = enforcer.queryViolations({ contentId: 'content-1' });
      expect(violations).toHaveLength(1);
      expect(violations[0].contentId).toBe('content-1');
    });

    it('should filter by review status', () => {
      const pending = enforcer.queryViolations({ reviewed: false });
      expect(pending.length).toBeGreaterThanOrEqual(3);

      // Mark one as reviewed
      const first = pending[0];
      enforcer.markViolationReviewed(first.id, 'reviewer');

      const stillPending = enforcer.queryViolations({ reviewed: false });
      expect(stillPending.length).toBe(pending.length - 1);
    });

    it('should apply limit', () => {
      const all = enforcer.queryViolations();
      const limited = enforcer.queryViolations({ limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty enforcer', () => {
      const stats = enforcer.getStats();
      expect(stats.totalViolations).toBe(0);
      expect(stats.pendingReview).toBe(0);
      expect(stats.reviewed).toBe(0);
    });

    it('should count violations correctly', () => {
      enforcer.analyzeContentDecision(createMockContentDecision('quarantine', 'content-1'));
      enforcer.analyzeContentDecision(createMockContentDecision('reject', 'content-2'));
      enforcer.analyzeActionDecision(createMockActionDecision('reject', 'action-1', ['content-3']));

      const stats = enforcer.getStats();
      expect(stats.totalViolations).toBe(3);
      expect(stats.pendingReview).toBe(3);
      expect(stats.reviewed).toBe(0);
      expect(stats.byType.content_quarantine_escalates_action).toBe(1);
      expect(stats.byType.content_reject_blocks_action).toBe(1);
      expect(stats.byType.action_reject_flags_content).toBe(1);
    });
  });

  describe('serialization', () => {
    it('should serialize and load state correctly', () => {
      // Create some violations
      enforcer.analyzeContentDecision(createMockContentDecision('quarantine', 'content-1'));
      enforcer.analyzeActionDecision(createMockActionDecision('reject', 'action-1', ['content-2']));

      // Serialize
      const serialized = enforcer.serialize();
      expect(serialized.violations).toHaveLength(2);
      expect(serialized.reviewRequirements.length).toBeGreaterThanOrEqual(1);

      // Reset and load
      resetCrossDomainPolicyEnforcer();
      const loaded = CrossDomainPolicyEnforcer.load(serialized);

      // Verify loaded state
      const stats = loaded.getStats();
      expect(stats.totalViolations).toBe(2);
    });
  });

  describe('exportToJSONL', () => {
    it('should export violations as JSONL', () => {
      enforcer.analyzeContentDecision(createMockContentDecision('quarantine', 'content-1'));
      enforcer.analyzeContentDecision(createMockContentDecision('reject', 'content-2'));

      const jsonl = enforcer.exportToJSONL();
      const lines = jsonl.split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(2);

      // Verify each line is valid JSON
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.id).toBeDefined();
        expect(parsed.type).toBeDefined();
      }
    });
  });
});

describe('Cross-domain convenience functions', () => {
  beforeEach(() => {
    resetCrossDomainPolicyEnforcer();
    resetGovernanceDecisionEngine();
  });

  afterEach(() => {
    resetCrossDomainPolicyEnforcer();
    resetGovernanceDecisionEngine();
  });

  describe('analyzeDecisionForCrossDomainEffects', () => {
    it('should route content decisions correctly', () => {
      const decision = createMockContentDecision('quarantine', 'content-1');
      const violations = analyzeDecisionForCrossDomainEffects(decision);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('content_quarantine_escalates_action');
    });

    it('should route action decisions correctly', () => {
      const decision = createMockActionDecision('reject', 'action-1', ['content-1']);
      const violations = analyzeDecisionForCrossDomainEffects(decision);
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('action_reject_flags_content');
    });

    it('should return empty array for policy overrides', () => {
      const decision: DecisionRecord = {
        id: 'dec_test',
        type: 'policy_override',
        decision: {
          verdict: 'approve',
          confidence: 1.0,
          reasoning: 'Override',
          policyVersion: '1.0.0',
          policyName: 'test',
          checkedVerifications: [],
          decidedAt: new Date().toISOString(),
        },
        context: { actor: 'test', reason: 'test' },
        request: {
          originalDecisionId: 'dec_original',
          newVerdict: 'approve',
          overrideReason: 'test',
          overrideActor: 'test',
        },
        policyName: 'test',
        createdAt: new Date().toISOString(),
      };

      const violations = analyzeDecisionForCrossDomainEffects(decision);
      expect(violations).toHaveLength(0);
    });
  });

  describe('checkCrossDomainActionRisk', () => {
    it('should use global enforcer', () => {
      // Create a quarantine violation first
      const contentDecision = createMockContentDecision('quarantine', 'content-1');
      analyzeDecisionForCrossDomainEffects(contentDecision);

      // Check using convenience function
      const result = checkCrossDomainActionRisk('action-1', ['content-1']);
      expect(result.elevated).toBe(true);
    });
  });

  describe('checkCrossDomainContentReview', () => {
    it('should use global enforcer', () => {
      // Create an action reject violation first
      const actionDecision = createMockActionDecision('reject', 'action-1', ['content-1']);
      analyzeDecisionForCrossDomainEffects(actionDecision);

      // Check using convenience function
      const result = checkCrossDomainContentReview('content-1');
      expect(result.reviewRequired).toBe(true);
    });
  });
});

describe('Cross-domain singleton', () => {
  beforeEach(() => {
    resetCrossDomainPolicyEnforcer();
  });

  afterEach(() => {
    resetCrossDomainPolicyEnforcer();
  });

  it('should return same instance from getCrossDomainPolicyEnforcer', () => {
    const enforcer1 = getCrossDomainPolicyEnforcer();
    const enforcer2 = getCrossDomainPolicyEnforcer();
    expect(enforcer1).toBe(enforcer2);
  });

  it('should allow setting custom enforcer', () => {
    const customEnforcer = new CrossDomainPolicyEnforcer();
    setCrossDomainPolicyEnforcer(customEnforcer);

    const retrieved = getCrossDomainPolicyEnforcer();
    expect(retrieved).toBe(customEnforcer);
  });

  it('should create new instance after reset', () => {
    const enforcer1 = getCrossDomainPolicyEnforcer();
    resetCrossDomainPolicyEnforcer();
    const enforcer2 = getCrossDomainPolicyEnforcer();

    expect(enforcer1).not.toBe(enforcer2);
  });
});
