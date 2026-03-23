/**
 * Unified Audit Ledger Tests
 *
 * Comprehensive test coverage for unified audit ledger that bridges
 * quarantine-audit.ts and governance-decision-engine.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedAuditLedger,
  getUnifiedAuditLedger,
  setUnifiedAuditLedger,
  resetUnifiedAuditLedger,
  getRecentAuditEntries,
  getPendingReviews,
  getQuickStats,
  type UnifiedAuditEntry,
  type UnifiedEventType,
} from './unified-audit-ledger.js';
import type { AuditEntry } from './quarantine-audit.js';
import type { DecisionRecord, DecisionType } from './governance-decision-engine.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockQuarantineEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type: 'gate_decision',
    timestamp: Date.now(),
    contentId: 'content-123',
    action: 'quarantine',
    trustTier: 'external-untrusted',
    scanVerdict: 'suspicious',
    scanScore: 0.6,
    confidenceCap: 0.5,
    gatePolicy: 'production',
    gateVersion: '1.0.0',
    requiresReview: true,
    reason: 'Suspicious content detected',
    metadata: {
      contentLength: 1000,
      sourceOrigin: 'moltbook',
      processedAt: Date.now(),
    },
    ...overrides,
  };
}

function createMockDecisionRecord(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  const type = (overrides.type || 'action_execution') as DecisionType;
  return {
    id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type,
    decision: {
      verdict: 'approve',
      confidence: 0.85,
      reasoning: 'All verifications passed',
      policyVersion: '1.0.0',
      policyName: 'production',
      checkedVerifications: ['preflight_checks', 'grounded_query'],
      decidedAt: new Date().toISOString(),
    },
    context: {
      actor: 'victor-agent',
      reason: 'Test execution',
      projectId: 'victor-resident',
      phaseId: 'phase_1',
      taskId: 'task_1',
      sessionId: 'session_123',
    },
    request: {
      actionId: 'action-123',
      description: 'Test action',
      riskLevel: 'medium',
      preflightPassed: true,
      groundedQueryPerformed: true,
      snapshotCreated: true,
    },
    policyName: 'production',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('UnifiedAuditLedger - Initialization', () => {
  beforeEach(() => {
    resetUnifiedAuditLedger();
  });

  it('should initialize with empty entries', async () => {
    const ledger = new UnifiedAuditLedger();
    await ledger.initialize();

    expect(ledger.isInitialized()).toBe(true);
    const stats = await ledger.getStats();
    expect(stats.total).toBe(0);
  });

  it('should throw when querying before initialization', async () => {
    const ledger = new UnifiedAuditLedger();

    await expect(ledger.query()).rejects.toThrow('not initialized');
  });

  it('should reset on close', async () => {
    const ledger = new UnifiedAuditLedger();
    await ledger.initialize();

    const entry = createMockQuarantineEntry();
    ledger.ingestQuarantineEntry(entry);

    await ledger.close();
    expect(ledger.isInitialized()).toBe(false);
  });

  it('should enforce maxEntries limit', async () => {
    const ledger = new UnifiedAuditLedger(5);
    await ledger.initialize();

    // Add 10 entries
    for (let i = 0; i < 10; i++) {
      const entry = createMockQuarantineEntry({ contentId: `content-${i}` });
      ledger.ingestQuarantineEntry(entry);
    }

    const stats = await ledger.getStats();
    expect(stats.total).toBe(5); // Limited to 5
  });
});

// ============================================================================
// Quarantine Entry Ingestion Tests
// ============================================================================

describe('UnifiedAuditLedger - Quarantine Entry Ingestion', () => {
  let ledger: UnifiedAuditLedger;

  beforeEach(async () => {
    resetUnifiedAuditLedger();
    ledger = new UnifiedAuditLedger();
    await ledger.initialize();
  });

  it('should ingest gate_decision entry', async () => {
    const entry = createMockQuarantineEntry({
      type: 'gate_decision',
      action: 'quarantine',
      requiresReview: true,
    });

    const unified = ledger.ingestQuarantineEntry(entry);

    expect(unified.type).toBe('gate_decision');
    expect(unified.subjectId).toBe('content-123');
    expect(unified.verdict).toBe('quarantine');
    expect(unified.requiresReview).toBe(true);
    expect(unified._source.type).toBe('quarantine_audit');
    expect(unified._source.entryId).toBe(entry.id);
  });

  it('should ingest review_action entry', async () => {
    const entry = createMockQuarantineEntry({
      type: 'review_action',
      action: 'approve',
      reviewer: 'human-reviewer',
      reviewNotes: 'Looks safe',
      requiresReview: false,
    });

    const unified = ledger.ingestQuarantineEntry(entry);

    expect(unified.type).toBe('review_action');
    expect(unified.actor.type).toBe('reviewer');
    expect(unified.review?.reviewer).toBe('human-reviewer');
    expect(unified.review?.decision).toBe('approve');
  });

  it('should ingest expiration entry', async () => {
    const entry = createMockQuarantineEntry({
      type: 'expiration',
      action: 'expire',
    });

    const unified = ledger.ingestQuarantineEntry(entry);

    expect(unified.type).toBe('expiration');
    expect(unified.verdict).toBe('expire');
  });

  it('should ingest system_event entry', async () => {
    const entry = createMockQuarantineEntry({
      type: 'system_event',
      action: 'system_init',
    });

    const unified = ledger.ingestQuarantineEntry(entry);

    expect(unified.type).toBe('system_event');
    expect(unified.verdict).toBe('system_init');
  });

  it('should map scan metadata correctly', async () => {
    const entry = createMockQuarantineEntry({
      scanVerdict: 'hostile',
      scanScore: 0.95,
    });

    const unified = ledger.ingestQuarantineEntry(entry);

    expect(unified.scan?.verdict).toBe('hostile');
    expect(unified.scan?.score).toBe(0.95);
  });

  it('should set timestamps correctly', async () => {
    const now = Date.now();
    const entry = createMockQuarantineEntry({ timestamp: now });

    const unified = ledger.ingestQuarantineEntry(entry);

    expect(unified.timestamp).toBe(now);
    expect(unified.isoDate).toBe(new Date(now).toISOString());
  });
});

// ============================================================================
// Governance Decision Ingestion Tests
// ============================================================================

describe('UnifiedAuditLedger - Governance Decision Ingestion', () => {
  let ledger: UnifiedAuditLedger;

  beforeEach(async () => {
    resetUnifiedAuditLedger();
    ledger = new UnifiedAuditLedger();
    await ledger.initialize();
  });

  it('should ingest content_admission decision', async () => {
    const record = createMockDecisionRecord({
      type: 'content_admission',
      request: { origin: 'moltbook-post-123', trustTier: 'external-verified' },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.type).toBe('content_admission');
    expect(unified._source.type).toBe('governance_decision');
    expect(unified._source.entryId).toBe(record.id);
  });

  it('should ingest action_execution decision', async () => {
    const record = createMockDecisionRecord({
      type: 'action_execution',
      request: {
        actionId: 'write-file-123',
        riskLevel: 'medium',
      },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.type).toBe('action_execution');
    expect(unified.subjectId).toBe('write-file-123');
    expect(unified.riskLevel).toBe('medium');
  });

  it('should ingest policy_override decision', async () => {
    const record = createMockDecisionRecord({
      type: 'policy_override',
      request: {
        originalDecisionId: 'dec-original',
        newVerdict: 'approve',
        overrideReason: 'Emergency fix',
        overrideActor: 'admin',
      },
      overriddenBy: undefined,
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.type).toBe('policy_override');
    expect(unified.actor.type).toBe('agent'); // 'admin' doesn't match specific patterns
  });

  it('should set requiresReview for quarantine verdict', async () => {
    const record = createMockDecisionRecord({
      decision: {
        verdict: 'quarantine',
        confidence: 0.5,
        reasoning: 'Needs review',
        policyVersion: '1.0.0',
        policyName: 'production',
        checkedVerifications: [],
        decidedAt: new Date().toISOString(),
      },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.requiresReview).toBe(true);
  });

  it('should set requiresReview for reject verdict', async () => {
    const record = createMockDecisionRecord({
      decision: {
        verdict: 'reject',
        confidence: 0.95,
        reasoning: 'Hostile content',
        policyVersion: '1.0.0',
        policyName: 'production',
        checkedVerifications: [],
        decidedAt: new Date().toISOString(),
      },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.requiresReview).toBe(true);
  });

  it('should map context correctly', async () => {
    const record = createMockDecisionRecord({
      context: {
        actor: 'victor-agent',
        reason: 'Governed execution',
        projectId: 'victor-resident',
        phaseId: 'phase_test',
        taskId: 'task_test',
        sessionId: 'session_test',
      },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.context.projectId).toBe('victor-resident');
    expect(unified.context.phaseId).toBe('phase_test');
    expect(unified.context.taskId).toBe('task_test');
    expect(unified.context.sessionId).toBe('session_test');
  });

  it('should infer agent actor type', async () => {
    const record = createMockDecisionRecord({
      context: { actor: 'victor-agent', reason: 'Test' },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.actor.type).toBe('agent');
  });

  it('should infer system actor type', async () => {
    const record = createMockDecisionRecord({
      context: { actor: 'system', reason: 'Test' },
    });

    const unified = ledger.ingestGovernanceDecision(record);

    expect(unified.actor.type).toBe('system');
  });
});

// ============================================================================
// Query Tests
// ============================================================================

describe('UnifiedAuditLedger - Query Operations', () => {
  let ledger: UnifiedAuditLedger;

  beforeEach(async () => {
    resetUnifiedAuditLedger();
    ledger = new UnifiedAuditLedger();
    await ledger.initialize();

    // Seed with mixed entries
    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      type: 'gate_decision',
      contentId: 'content-1',
      trustTier: 'external-untrusted',
      action: 'quarantine',
      requiresReview: true,
    }));

    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      type: 'review_action',
      contentId: 'content-1',
      action: 'approve',
      reviewer: 'user-1',
      requiresReview: false,
    }));

    ledger.ingestGovernanceDecision(createMockDecisionRecord({
      type: 'action_execution',
      request: { actionId: 'action-1', riskLevel: 'high' },
      context: { actor: 'victor-agent', reason: 'Test', projectId: 'project-a' },
    }));

    ledger.ingestGovernanceDecision(createMockDecisionRecord({
      type: 'content_admission',
      request: { origin: 'content-2', trustTier: 'internal' },
      context: { actor: 'system', reason: 'Test', projectId: 'project-b' },
    }));
  });

  it('should query by type', async () => {
    const results = await ledger.query({ type: 'gate_decision' });

    expect(results.length).toBe(1);
    expect(results[0].type).toBe('gate_decision');
  });

  it('should query by subjectId', async () => {
    const results = await ledger.query({ subjectId: 'content-1' });

    expect(results.length).toBe(2); // gate_decision + review_action
    expect(results.every(r => r.subjectId === 'content-1')).toBe(true);
  });

  it('should query by actorId', async () => {
    const results = await ledger.query({ actorId: 'victor-agent' });

    expect(results.length).toBe(1);
    expect(results[0].actor.id).toBe('victor-agent');
  });

  it('should query by actorType', async () => {
    const results = await ledger.query({ actorType: 'gate' });

    expect(results.length).toBe(1);
    expect(results[0].actor.type).toBe('gate');
  });

  it('should query by verdict', async () => {
    const results = await ledger.query({ verdict: 'quarantine' });

    expect(results.length).toBe(1);
    expect(results[0].verdict).toBe('quarantine');
  });

  it('should query by projectId', async () => {
    const results = await ledger.query({ projectId: 'project-a' });

    expect(results.length).toBe(1);
    expect(results[0].context.projectId).toBe('project-a');
  });

  it('should query by trustTier', async () => {
    const results = await ledger.query({ trustTier: 'external-untrusted' });

    expect(results.length).toBe(2); // gate_decision + governance decision with same tier
    expect(results.every(r => r.context.sourceTrustTier === 'external-untrusted')).toBe(true);
  });

  it('should query by riskLevel', async () => {
    const results = await ledger.query({ riskLevel: 'high' });

    expect(results.length).toBe(1);
    expect(results[0].riskLevel).toBe('high');
  });

  it('should query by requiresReview', async () => {
    const results = await ledger.query({ requiresReview: true });

    expect(results.length).toBe(1);
    expect(results[0].requiresReview).toBe(true);
  });

  it('should query by hasReview', async () => {
    const results = await ledger.query({ hasReview: true });

    expect(results.length).toBe(1);
    expect(results[0].review).toBeDefined();
  });

  it('should apply time filters', async () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneHourFuture = now + 60 * 60 * 1000;

    const results = await ledger.query({
      after: oneHourAgo,
      before: oneHourFuture,
    });

    expect(results.length).toBe(4); // All entries within range
  });

  it('should apply pagination', async () => {
    const results = await ledger.query({ limit: 2, offset: 0 });

    expect(results.length).toBe(2);
  });

  it('should sort by timestamp descending', async () => {
    // Add entries with explicit timestamps
    const ledger2 = new UnifiedAuditLedger();
    await ledger2.initialize();

    ledger2.ingestQuarantineEntry(createMockQuarantineEntry({
      timestamp: 1000,
      contentId: 'older',
    }));

    ledger2.ingestQuarantineEntry(createMockQuarantineEntry({
      timestamp: 2000,
      contentId: 'newer',
    }));

    const results = await ledger2.query({ limit: 2 });

    expect(results[0].timestamp).toBe(2000);
    expect(results[1].timestamp).toBe(1000);
  });

  it('should get subject history', async () => {
    const results = await ledger.getSubjectHistory('content-1');

    expect(results.length).toBe(2);
  });

  it('should get project entries', async () => {
    const results = await ledger.getProjectEntries('project-a');

    expect(results.length).toBe(1);
    expect(results[0].context.projectId).toBe('project-a');
  });

  it('should get pending reviews', async () => {
    const results = await ledger.getPendingReview();

    expect(results.length).toBe(1);
    expect(results[0].requiresReview).toBe(true);
  });

  it('should get recent entries', async () => {
    const results = await ledger.getRecent(3);

    expect(results.length).toBe(3);
  });

  it('should get latest entry', async () => {
    const result = await ledger.getLatest();

    expect(result).toBeDefined();
    expect(result?.timestamp).toBeGreaterThan(0);
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('UnifiedAuditLedger - Statistics', () => {
  let ledger: UnifiedAuditLedger;

  beforeEach(async () => {
    resetUnifiedAuditLedger();
    ledger = new UnifiedAuditLedger();
    await ledger.initialize();

    // Seed with diverse entries
    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      type: 'gate_decision',
      trustTier: 'external-untrusted',
      action: 'quarantine',
      confidenceCap: 0.5,
      requiresReview: true,
    }));

    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      type: 'gate_decision',
      trustTier: 'internal',
      action: 'admit',
      confidenceCap: 0.85,
      requiresReview: false,
    }));

    ledger.ingestGovernanceDecision(createMockDecisionRecord({
      type: 'action_execution',
      request: { actionId: 'action-1', riskLevel: 'high' },
      decision: {
        verdict: 'approve',
        confidence: 0.9,
        reasoning: 'Test',
        policyVersion: '1.0.0',
        policyName: 'production',
        checkedVerifications: [],
        decidedAt: new Date().toISOString(),
      },
    }));

    ledger.ingestGovernanceDecision(createMockDecisionRecord({
      type: 'content_admission',
      request: { origin: 'content-3' },
      context: { actor: 'system', reason: 'Test' },
      decision: {
        verdict: 'reject',
        confidence: 0.3,
        reasoning: 'Test',
        policyVersion: '1.0.0',
        policyName: 'production',
        checkedVerifications: [],
        decidedAt: new Date().toISOString(),
      },
    }));

    // Add a reviewed entry
    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      type: 'review_action',
      reviewer: 'user-1',
      action: 'approve',
      requiresReview: false,
    }));
  });

  it('should calculate total count', async () => {
    const stats = await ledger.getStats();

    expect(stats.total).toBe(5);
  });

  it('should count by type', async () => {
    const stats = await ledger.getStats();

    expect(stats.byType.gate_decision).toBe(2);
    expect(stats.byType.action_execution).toBe(1);
    expect(stats.byType.content_admission).toBe(1);
    expect(stats.byType.review_action).toBe(1);
  });

  it('should count by verdict', async () => {
    const stats = await ledger.getStats();

    expect(stats.byVerdict.quarantine).toBe(1);
    expect(stats.byVerdict.admit).toBe(1);
    expect(stats.byVerdict.approve).toBe(2); // action_execution + review_action
    expect(stats.byVerdict.reject).toBe(1);
  });

  it('should count by actor type', async () => {
    const stats = await ledger.getStats();

    expect(stats.byActorType.gate).toBeGreaterThan(0);
    expect(stats.byActorType.agent).toBeGreaterThan(0);
  });

  it('should count by trust tier', async () => {
    const stats = await ledger.getStats();

    expect(stats.byTrustTier['external-untrusted']).toBe(2);
    expect(stats.byTrustTier['internal']).toBe(1);
  });

  it('should count by risk level', async () => {
    const stats = await ledger.getStats();

    expect(stats.byRiskLevel.high).toBe(1);
  });

  it('should count requiringReview', async () => {
    const stats = await ledger.getStats();

    expect(stats.requiringReview).toBe(2); // quarantine + reject
  });

  it('should count reviewed', async () => {
    const stats = await ledger.getStats();

    expect(stats.reviewed).toBe(1); // review_action
  });

  it('should calculate average confidence', async () => {
    const stats = await ledger.getStats();

    // (0.5 + 0.85 + 0.9 + 0.3 + confidence from review_action) / 5
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.averageConfidence).toBeLessThanOrEqual(1);
  });

  it('should set date range', async () => {
    const stats = await ledger.getStats();

    expect(stats.dateRange.earliest).toBeGreaterThan(0);
    expect(stats.dateRange.latest).toBeGreaterThanOrEqual(stats.dateRange.earliest);
  });

  it('should handle empty ledger', async () => {
    const emptyLedger = new UnifiedAuditLedger();
    await emptyLedger.initialize();

    const stats = await emptyLedger.getStats();

    expect(stats.total).toBe(0);
    expect(stats.averageConfidence).toBe(0);
    expect(stats.dateRange.earliest).toBe(0);
    expect(stats.dateRange.latest).toBe(0);
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('UnifiedAuditLedger - Export', () => {
  let ledger: UnifiedAuditLedger;

  beforeEach(async () => {
    resetUnifiedAuditLedger();
    ledger = new UnifiedAuditLedger();
    await ledger.initialize();

    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      contentId: 'export-test-1',
      action: 'admit',
    }));

    ledger.ingestGovernanceDecision(createMockDecisionRecord({
      type: 'action_execution',
      request: { actionId: 'export-test-2' },
    }));
  });

  it('should export to JSONL', async () => {
    const jsonl = await ledger.exportToJSONL();

    const lines = jsonl.split('\n');
    expect(lines.length).toBe(2);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBeDefined();
    expect(parsed.type).toBeDefined();
  });

  it('should export with query filter', async () => {
    const jsonl = await ledger.exportToJSONL({ type: 'gate_decision' });

    const lines = jsonl.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('gate_decision');
  });

  it('should export to JSON', async () => {
    const json = await ledger.exportToJson();

    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });

  it('should generate report', async () => {
    const report = await ledger.generateReport();

    expect(report).toContain('Unified Audit Ledger Report');
    expect(report).toContain('Total Entries: 2');
    expect(report).toContain('By Type:');
    expect(report).toContain('By Verdict:');
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe('UnifiedAuditLedger - Singleton', () => {
  beforeEach(() => {
    resetUnifiedAuditLedger();
  });

  it('should return global instance', () => {
    const ledger1 = getUnifiedAuditLedger();
    const ledger2 = getUnifiedAuditLedger();

    expect(ledger1).toBe(ledger2);
  });

  it('should set global instance', () => {
    const newLedger = new UnifiedAuditLedger();
    setUnifiedAuditLedger(newLedger);

    const retrieved = getUnifiedAuditLedger();
    expect(retrieved).toBe(newLedger);
  });

  it('should reset global instance', () => {
    const ledger1 = getUnifiedAuditLedger();
    resetUnifiedAuditLedger();
    const ledger2 = getUnifiedAuditLedger();

    expect(ledger1).not.toBe(ledger2);
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe('UnifiedAuditLedger - Convenience Functions', () => {
  beforeEach(async () => {
    resetUnifiedAuditLedger();
    const ledger = getUnifiedAuditLedger();
    await ledger.initialize();

    // Seed with test data
    ledger.ingestQuarantineEntry(createMockQuarantineEntry({
      action: 'quarantine',
      requiresReview: true,
    }));

    ledger.ingestGovernanceDecision(createMockDecisionRecord());
  });

  it('getRecentAuditEntries should return recent entries', async () => {
    const entries = await getRecentAuditEntries(2);

    expect(entries.length).toBe(2);
  });

  it('getPendingReviews should return entries requiring review', async () => {
    const entries = await getPendingReviews();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].requiresReview).toBe(true);
  });

  it('getQuickStats should return stats', async () => {
    const stats = await getQuickStats();

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byType).toBeDefined();
  });
});

// ============================================================================
// Custom Entry Addition Tests
// ============================================================================

describe('UnifiedAuditLedger - Custom Entry Addition', () => {
  let ledger: UnifiedAuditLedger;

  beforeEach(async () => {
    resetUnifiedAuditLedger();
    ledger = new UnifiedAuditLedger();
    await ledger.initialize();
  });

  it('should add custom entry directly', async () => {
    const customEntry: UnifiedAuditEntry = {
      id: 'custom-1',
      type: 'system_event',
      timestamp: Date.now(),
      isoDate: new Date().toISOString(),
      subjectId: 'system',
      actor: { id: 'system', type: 'system' },
      verdict: 'system_init',
      confidence: 1.0,
      reasoning: 'System initialized',
      policy: { name: 'system', version: '1.0.0' },
      context: {},
      requiresReview: false,
      provenance: {},
      _source: { type: 'governance_decision', entryId: 'system-init' },
    };

    ledger.addEntry(customEntry);

    const results = await ledger.query({ subjectId: 'system' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('custom-1');
  });
});
