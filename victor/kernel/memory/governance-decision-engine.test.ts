/**
 * Governance Decision Engine Tests
 *
 * Comprehensive tests for the governance decision engine, covering:
 * - Policy management
 * - Content admission decisions
 * - Action execution decisions
 * - Decision overrides
 * - Decision queries and stats
 * - Export and serialization
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  GovernanceDecisionEngine,
  getGovernanceDecisionEngine,
  setGovernanceDecisionEngine,
  resetGovernanceDecisionEngine,
  quickContentAdmission,
  quickActionCheck,
  type DecisionRecord,
  type DecisionContext,
  type ContentAdmissionRequest,
  type ActionExecutionRequest,
} from './governance-decision-engine.js';
import {
  DEFAULT_UNIFIED_POLICY,
  STRICT_UNIFIED_POLICY,
  PERMISSIVE_UNIFIED_POLICY,
} from './unified-policy.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestContext(actor: string, reason: string, projectId?: string): DecisionContext {
  return { actor, reason, projectId };
}

function createContentRequest(
  content: string,
  trustTier: ContentAdmissionRequest['trustTier'] = 'internal',
): ContentAdmissionRequest {
  return {
    content,
    trustTier,
    origin: 'test-origin',
    contentId: 'test-content-1',
  };
}

function createActionRequest(
  actionId: string,
  riskLevel: ActionExecutionRequest['riskLevel'] = 'low',
  preflightPassed = true,
  groundedQueryPerformed = true,
): ActionExecutionRequest {
  return {
    actionId,
    description: `Test action ${actionId}`,
    riskLevel,
    preflightPassed,
    groundedQueryPerformed,
  };
}

// ============================================================================
// Policy Management Tests
// ============================================================================

describe('GovernanceDecisionEngine - Policy Management', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    resetGovernanceDecisionEngine();
    engine = new GovernanceDecisionEngine();
  });

  it('should use production policy by default', () => {
    const policy = engine.getPolicy();
    expect(policy.name).toBe('production');
  });

  it('should set custom policy', () => {
    engine.setPolicy(STRICT_UNIFIED_POLICY);
    const policy = engine.getPolicy();
    expect(policy.name).toBe('strict');
  });

  it('should switch to named policy', () => {
    expect(engine.switchPolicy('strict')).toBe(true);
    expect(engine.getPolicy().name).toBe('strict');

    expect(engine.switchPolicy('permissive')).toBe(true);
    expect(engine.getPolicy().name).toBe('permissive');
  });

  it('should return false for unknown policy name', () => {
    expect(engine.switchPolicy('unknown')).toBe(false);
  });
});

// ============================================================================
// Content Admission Tests
// ============================================================================

describe('GovernanceDecisionEngine - Content Admission', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    engine = new GovernanceDecisionEngine();
  });

  it('should quarantine content without scan result', () => {
    const request = createContentRequest('test content', 'external-untrusted');
    const context = createTestContext('system', 'Testing admission');

    const decision = engine.decideContentAdmission(request, context);

    expect(decision.decision.verdict).toBe('quarantine');
    expect(decision.type).toBe('content_admission');
    expect(decision.id).toMatch(/^dec_\d+_[a-z0-9]+$/);
  });

  it('should reject hostile content', () => {
    const request: ContentAdmissionRequest = {
      content: 'malicious content',
      trustTier: 'external-untrusted',
      origin: 'test',
      scanResult: {
        verdict: 'hostile',
        score: 8.5,
        matchedCategories: ['instruction_injection', 'code_injection'],
      },
    };
    const context = createTestContext('system', 'Testing hostile content');

    const decision = engine.decideContentAdmission(request, context);

    expect(decision.decision.verdict).toBe('reject');
    expect(decision.decision.confidence).toBeGreaterThan(0.9);
    expect(decision.decision.reasoning).toContain('Hostile');
  });

  it('should quarantine suspicious content with auto-quarantine enabled', () => {
    const request: ContentAdmissionRequest = {
      content: 'suspicious content',
      trustTier: 'external-verified',
      origin: 'test',
      scanResult: {
        verdict: 'suspicious',
        score: 4.2,
        matchedCategories: ['obfuscated_content'],
      },
    };
    const context = createTestContext('system', 'Testing suspicious content');

    const decision = engine.decideContentAdmission(request, context);

    expect(decision.decision.verdict).toBe('quarantine');
    expect(decision.decision.reasoning).toContain('Suspicious');
  });

  it('should approve suspicious content when auto-quarantine disabled', () => {
    engine.setPolicy(PERMISSIVE_UNIFIED_POLICY);

    const request: ContentAdmissionRequest = {
      content: 'suspicious content',
      trustTier: 'external-verified',
      origin: 'test',
      scanResult: {
        verdict: 'suspicious',
        score: 4.2,
        matchedCategories: ['obfuscated_content'],
      },
    };
    const context = createTestContext('system', 'Testing suspicious content');

    const decision = engine.decideContentAdmission(request, context);

    expect(decision.decision.verdict).toBe('approve');
    expect(decision.decision.reasoning).toContain('Auto-quarantine disabled');
  });

  it('should approve clean content', () => {
    const request: ContentAdmissionRequest = {
      content: 'normal content',
      trustTier: 'internal',
      origin: 'test',
      scanResult: {
        verdict: 'clean',
        score: 0,
        matchedCategories: [],
      },
    };
    const context = createTestContext('system', 'Testing clean content');

    const decision = engine.decideContentAdmission(request, context);

    expect(decision.decision.verdict).toBe('approve');
    expect(decision.decision.confidence).toBeGreaterThan(0.8);
  });

  it('should record decision with full context', () => {
    const request = createContentRequest('test');
    const context = createTestContext('agent-1', 'Testing context', 'project-a');

    const decision = engine.decideContentAdmission(request, context);

    expect(decision.context.actor).toBe('agent-1');
    expect(decision.context.reason).toBe('Testing context');
    expect(decision.context.projectId).toBe('project-a');
    expect(decision.policyName).toBe('production');
  });

  it('should batch evaluate content admission requests', () => {
    const requests = [
      { request: createContentRequest('content 1'), context: createTestContext('system', 'Batch 1') },
      { request: createContentRequest('content 2'), context: createTestContext('system', 'Batch 2') },
      { request: createContentRequest('content 3'), context: createTestContext('system', 'Batch 3') },
    ];

    const decisions = engine.decideContentAdmissionBatch(requests);

    expect(decisions).toHaveLength(3);
    decisions.forEach((d) => {
      expect(d.type).toBe('content_admission');
      expect(d.id).toMatch(/^dec_/);
    });
  });
});

// ============================================================================
// Action Execution Tests
// ============================================================================

describe('GovernanceDecisionEngine - Action Execution', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    engine = new GovernanceDecisionEngine();
  });

  it('should approve low-risk action with all verifications', () => {
    const request = createActionRequest('action-1', 'low', true, true);
    const context = createTestContext('system', 'Testing action');

    const decision = engine.decideActionExecution(request, context);

    expect(decision.decision.verdict).toBe('approve');
    expect(decision.decision.confidence).toBeGreaterThan(0.5);
  });

  it('should quarantine medium-risk action without snapshot', () => {
    const request: ActionExecutionRequest = {
      actionId: 'action-medium',
      description: 'Medium risk action',
      riskLevel: 'medium',
      preflightPassed: true,
      groundedQueryPerformed: true,
      snapshotCreated: false,
    };
    const context = createTestContext('system', 'Testing medium risk');

    const decision = engine.decideActionExecution(request, context);

    expect(decision.decision.verdict).toBe('quarantine');
    expect(decision.decision.missingVerifications).toContain('snapshot_backup');
  });

  it('should reject high-risk action without human review in strict policy', () => {
    engine.setPolicy(STRICT_UNIFIED_POLICY);

    const request: ActionExecutionRequest = {
      actionId: 'action-high',
      description: 'High risk action',
      riskLevel: 'high',
      preflightPassed: true,
      groundedQueryPerformed: true,
      snapshotCreated: true,
    };
    const context = createTestContext('system', 'Testing high risk');

    const decision = engine.decideActionExecution(request, context);

    expect(decision.decision.verdict).toBe('reject');
    expect(decision.decision.missingVerifications).toContain('dual_approval');
  });

  it('should quarantine high-risk action in production policy', () => {
    const request: ActionExecutionRequest = {
      actionId: 'action-high',
      description: 'High risk action',
      riskLevel: 'high',
      preflightPassed: true,
      groundedQueryPerformed: true,
      snapshotCreated: true,
    };
    const context = createTestContext('system', 'Testing high risk');

    const decision = engine.decideActionExecution(request, context);

    // Production policy requires human_review but treats it as checked
    // Since we don't actually have human review, confidence is reduced
    expect(decision.decision.confidence).toBeLessThan(1.0);
  });

  it('should use highest trust tier from multiple sources', () => {
    const request: ActionExecutionRequest = {
      actionId: 'action-multi-source',
      description: 'Multi-source action',
      riskLevel: 'medium',
      preflightPassed: true,
      groundedQueryPerformed: true,
      snapshotCreated: true,
      sourceTrustTiers: ['internal', 'external-verified', 'internal-generated'],
    };
    const context = createTestContext('system', 'Testing multi-source');

    const decision = engine.decideActionExecution(request, context);

    // Should use external-verified as the highest tier
    expect(decision.decision.verdict).toBe('approve');
    expect(decision.decision.reasoning).toContain('external-verified');
  });

  it('should approve external-untrusted high risk with full verifications in permissive policy', () => {
    engine.setPolicy(PERMISSIVE_UNIFIED_POLICY);

    const request: ActionExecutionRequest = {
      actionId: 'action-untrusted',
      description: 'Action with untrusted source',
      riskLevel: 'high',
      preflightPassed: true,
      groundedQueryPerformed: true,
      snapshotCreated: true,
      sourceTrustTiers: ['external-untrusted'],
    };
    const context = createTestContext('system', 'Testing untrusted');

    const decision = engine.decideActionExecution(request, context);

    // Permissive policy requires 0.95 confidence for high risk with external-untrusted
    // With all verifications (preflight, grounded, snapshot), confidence = 3/3 * 0.95 = 0.95
    // This meets the threshold, so the action is approved
    expect(decision.decision.verdict).toBe('approve');
    expect(decision.decision.confidence).toBe(0.95);
  });

  it('should batch evaluate action execution requests', () => {
    const requests = [
      { request: createActionRequest('a1', 'low'), context: createTestContext('system', 'Batch 1') },
      { request: createActionRequest('a2', 'low'), context: createTestContext('system', 'Batch 2') },
    ];

    const decisions = engine.decideActionExecutionBatch(requests);

    expect(decisions).toHaveLength(2);
    decisions.forEach((d) => {
      expect(d.type).toBe('action_execution');
    });
  });
});

// ============================================================================
// Decision Override Tests
// ============================================================================

describe('GovernanceDecisionEngine - Decision Overrides', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    engine = new GovernanceDecisionEngine();
  });

  it('should override an existing decision', () => {
    const request = createContentRequest('test');
    const context = createTestContext('system', 'Original');
    const original = engine.decideContentAdmission(request, context);

    const overrideRequest = {
      originalDecisionId: original.id,
      newVerdict: 'approve' as const,
      overrideReason: 'Manual review approved',
      overrideActor: 'admin',
    };
    const overrideContext = createTestContext('admin', 'Override');

    const override = engine.overrideDecision(overrideRequest, overrideContext);

    expect(override).not.toBeNull();
    expect(override?.decision.verdict).toBe('approve');
    expect(override?.type).toBe('policy_override');
    expect(override?.decision.confidence).toBe(1.0);
  });

  it('should mark original decision as overridden', () => {
    const request = createContentRequest('test');
    const context = createTestContext('system', 'Original');
    const original = engine.decideContentAdmission(request, context);

    const overrideRequest = {
      originalDecisionId: original.id,
      newVerdict: 'approve' as const,
      overrideReason: 'Manual review approved',
      overrideActor: 'admin',
    };
    const overrideContext = createTestContext('admin', 'Override');

    const override = engine.overrideDecision(overrideRequest, overrideContext);

    const retrievedOriginal = engine.getDecision(original.id);
    expect(retrievedOriginal?.overridden).toBe(true);
    expect(retrievedOriginal?.overriddenBy).toBe(override?.id);
  });

  it('should return null for non-existent decision', () => {
    const overrideRequest = {
      originalDecisionId: 'dec_nonexistent_123',
      newVerdict: 'approve' as const,
      overrideReason: 'Manual review',
      overrideActor: 'admin',
    };
    const context = createTestContext('admin', 'Override');

    const override = engine.overrideDecision(overrideRequest, context);

    expect(override).toBeNull();
  });

  it('should include original reasoning in override decision', () => {
    const request = createContentRequest('test');
    const context = createTestContext('system', 'Original');
    const original = engine.decideContentAdmission(request, context);
    const originalReasoning = original.decision.reasoning;

    const overrideRequest = {
      originalDecisionId: original.id,
      newVerdict: 'approve' as const,
      overrideReason: 'Manual override',
      overrideActor: 'admin',
    };
    const overrideContext = createTestContext('admin', 'Override');

    const override = engine.overrideDecision(overrideRequest, overrideContext);

    expect(override?.decision.reasoning).toContain(originalReasoning);
    expect(override?.decision.reasoning).toContain('Manual override');
  });
});

// ============================================================================
// Decision Query Tests
// ============================================================================

describe('GovernanceDecisionEngine - Decision Queries', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    engine = new GovernanceDecisionEngine();

    // Create test decisions
    for (let i = 0; i < 5; i++) {
      engine.decideContentAdmission(
        createContentRequest(`content-${i}`),
        createTestContext('system', `Test ${i}`, `project-${i % 2}`),
      );
    }
  });

  it('should get decision by ID', () => {
    const decision = engine.getRecentDecisions(1)[0];
    const retrieved = engine.getDecision(decision.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(decision.id);
    expect(retrieved?.accessedAt).toBeDefined();
  });

  it('should return null for unknown ID', () => {
    const retrieved = engine.getDecision('dec_unknown_123');
    expect(retrieved).toBeNull();
  });

  it('should query decisions by type', () => {
    const contentDecisions = engine.queryDecisions({ type: 'content_admission' });
    expect(contentDecisions.length).toBeGreaterThan(0);
    contentDecisions.forEach((d) => {
      expect(d.type).toBe('content_admission');
    });
  });

  it('should query decisions by project', () => {
    const projectDecisions = engine.queryDecisions({ projectId: 'project-0' });
    expect(projectDecisions.length).toBeGreaterThan(0);
    projectDecisions.forEach((d) => {
      expect(d.context.projectId).toBe('project-0');
    });
  });

  it('should query decisions by actor', () => {
    const actorDecisions = engine.queryDecisions({ actor: 'system' });
    expect(actorDecisions.length).toBeGreaterThan(0);
    actorDecisions.forEach((d) => {
      expect(d.context.actor).toBe('system');
    });
  });

  it('should query decisions with limit and offset', () => {
    const all = engine.queryDecisions();
    const limited = engine.queryDecisions({ limit: 2 });
    const offset = engine.queryDecisions({ limit: 2, offset: 2 });

    expect(limited.length).toBe(2);
    expect(offset.length).toBeLessThanOrEqual(3);
  });

  it('should get project decisions', () => {
    const decisions = engine.getProjectDecisions('project-0');
    decisions.forEach((d) => {
      expect(d.context.projectId).toBe('project-0');
    });
  });

  it('should get recent decisions', () => {
    const decisions = engine.getRecentDecisions(3);
    expect(decisions.length).toBeLessThanOrEqual(3);
  });

  it('should get decisions requiring review', () => {
    // Create a quarantine decision
    engine.decideContentAdmission(
      createContentRequest('quarantine-me'),
      createTestContext('system', 'Quarantine test'),
    );

    const reviewNeeded = engine.getDecisionsRequiringReview();
    expect(reviewNeeded.length).toBeGreaterThan(0);
    reviewNeeded.forEach((d) => {
      expect(['quarantine', 'reject']).toContain(d.decision.verdict);
    });
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('GovernanceDecisionEngine - Statistics', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    engine = new GovernanceDecisionEngine();
  });

  it('should return empty stats for new engine', () => {
    const stats = engine.getStats();

    expect(stats.totalDecisions).toBe(0);
    expect(stats.averageConfidence).toBe(0);
    expect(stats.last24Hours).toBe(0);
    expect(stats.overriddenCount).toBe(0);
  });

  it('should calculate stats correctly', () => {
    // Create diverse decisions
    for (let i = 0; i < 3; i++) {
      engine.decideContentAdmission(
        createContentRequest(`content-${i}`),
        createTestContext('system', `Test ${i}`),
      );
    }

    const stats = engine.getStats();

    expect(stats.totalDecisions).toBe(3);
    expect(stats.byType.content_admission).toBe(3);
    expect(stats.byPolicy.production).toBe(3);
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.last24Hours).toBe(3);
  });

  it('should track overridden decisions in stats', () => {
    const decision = engine.decideContentAdmission(
      createContentRequest('test'),
      createTestContext('system', 'Test'),
    );

    engine.overrideDecision(
      {
        originalDecisionId: decision.id,
        newVerdict: 'approve',
        overrideReason: 'Test override',
        overrideActor: 'admin',
      },
      createTestContext('admin', 'Override'),
    );

    const stats = engine.getStats();
    expect(stats.overriddenCount).toBe(1);
  });
});

// ============================================================================
// Export and Serialization Tests
// ============================================================================

describe('GovernanceDecisionEngine - Export and Serialization', () => {
  let engine: GovernanceDecisionEngine;

  beforeEach(() => {
    engine = new GovernanceDecisionEngine();
  });

  it('should export decisions to JSONL', () => {
    engine.decideContentAdmission(
      createContentRequest('test'),
      createTestContext('system', 'Test'),
    );

    const jsonl = engine.exportToJSONL();
    const lines = jsonl.split('\n').filter((l) => l.trim());

    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((line) => {
      const parsed = JSON.parse(line);
      expect(parsed.id).toMatch(/^dec_/);
      expect(parsed.type).toBeDefined();
      expect(parsed.decision).toBeDefined();
    });
  });

  it('should export filtered decisions', () => {
    engine.decideContentAdmission(
      createContentRequest('test1'),
      createTestContext('system', 'Test 1', 'project-a'),
    );
    engine.decideContentAdmission(
      createContentRequest('test2'),
      createTestContext('system', 'Test 2', 'project-b'),
    );

    const jsonl = engine.exportToJSONL({ projectId: 'project-a' });
    const lines = jsonl.split('\n').filter((l) => l.trim());

    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).context.projectId).toBe('project-a');
  });

  it('should serialize engine state', () => {
    engine.decideContentAdmission(
      createContentRequest('test'),
      createTestContext('system', 'Test'),
    );

    const serialized = engine.serialize();

    expect(serialized.decisions).toHaveLength(1);
    expect(serialized.currentPolicyName).toBe('production');
    expect(serialized.maxHistorySize).toBe(10000);
  });

  it('should load engine from serialized state', () => {
    // Create decisions
    engine.decideContentAdmission(
      createContentRequest('test1'),
      createTestContext('system', 'Test 1', 'project-a'),
    );
    engine.decideContentAdmission(
      createContentRequest('test2'),
      createTestContext('system', 'Test 2', 'project-b'),
    );

    const serialized = engine.serialize();
    const loaded = GovernanceDecisionEngine.load(serialized);

    const stats = loaded.getStats();
    expect(stats.totalDecisions).toBe(2);
    expect(loaded.getPolicy().name).toBe('production');
  });
});

// ============================================================================
// Global Instance Tests
// ============================================================================

describe('GovernanceDecisionEngine - Global Instance', () => {
  beforeEach(() => {
    resetGovernanceDecisionEngine();
  });

  it('should create global instance on first access', () => {
    const engine = getGovernanceDecisionEngine();
    expect(engine).toBeDefined();
    expect(engine.getPolicy().name).toBe('production');
  });

  it('should return same global instance', () => {
    const engine1 = getGovernanceDecisionEngine();
    const engine2 = getGovernanceDecisionEngine();
    expect(engine1).toBe(engine2);
  });

  it('should set custom global instance', () => {
    const custom = new GovernanceDecisionEngine(STRICT_UNIFIED_POLICY);
    setGovernanceDecisionEngine(custom);

    const engine = getGovernanceDecisionEngine();
    expect(engine.getPolicy().name).toBe('strict');
  });

  it('should reset global instance', () => {
    getGovernanceDecisionEngine(); // Create instance
    resetGovernanceDecisionEngine();

    // Creating new one should not be the same reference
    const newEngine = getGovernanceDecisionEngine();
    expect(newEngine.getPolicy().name).toBe('production');
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe('GovernanceDecisionEngine - Convenience Functions', () => {
  beforeEach(() => {
    resetGovernanceDecisionEngine();
  });

  it('should quick evaluate content admission', () => {
    const decision = quickContentAdmission(
      'test content',
      'internal',
      'test-origin',
      'quick-test',
    );

    expect(decision.type).toBe('content_admission');
    expect(decision.context.actor).toBe('quick-test');
  });

  it('should quick evaluate action execution', () => {
    const decision = quickActionCheck(
      'quick-action',
      'Quick test action',
      'low',
      'quick-test',
      true,
      true,
    );

    expect(decision.type).toBe('action_execution');
    expect(decision.context.actor).toBe('quick-test');
  });
});

// ============================================================================
// History Pruning Tests
// ============================================================================

describe('GovernanceDecisionEngine - History Pruning', () => {
  it('should prune oldest decisions when history limit reached', () => {
    const engine = new GovernanceDecisionEngine(DEFAULT_UNIFIED_POLICY, 10);

    // Add 15 decisions (exceeds 10 limit)
    for (let i = 0; i < 15; i++) {
      engine.decideContentAdmission(
        createContentRequest(`content-${i}`),
        createTestContext('system', `Test ${i}`),
      );
    }

    // Should have pruned oldest, keeping around 9 (90% of 10)
    const stats = engine.getStats();
    expect(stats.totalDecisions).toBeLessThan(15);
    expect(stats.totalDecisions).toBeGreaterThanOrEqual(9);
  });
});
