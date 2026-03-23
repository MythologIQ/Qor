/**
 * Quarantine Audit Ledger Tests
 *
 * Tests for the audit ledger that records gate decisions with traceability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditLedger,
  getAuditLedger,
  resetAuditLedger,
  auditGateDecision,
  auditReviewAction,
  type AuditEntry,
  type AuditQuery,
} from './quarantine-audit.js';
import {
  evaluateGate,
  DEFAULT_GATE_POLICY,
  STRICT_GATE_POLICY,
  PERMISSIVE_GATE_POLICY,
  type GateDecision,
  type ScanResult,
} from './quarantine-gate.js';
import type { SourceTrustMetadata } from './types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestScanResult(verdict: 'clean' | 'suspicious' | 'hostile', score: number): ScanResult {
  return {
    verdict,
    score,
    details: {
      patternMatches: [],
      heuristics: { lengthScore: 0, patternScore: score },
    },
  };
}

function createTestMetadata(tier: SourceTrustMetadata['tier'], origin: string): SourceTrustMetadata {
  return {
    tier,
    origin,
    fetchedAt: new Date().toISOString(),
    scanVerdict: 'clean',
    confidenceCap: 0.75,
  };
}

// ============================================================================
// AuditLedger Tests
// ============================================================================

describe('AuditLedger', () => {
  let ledger: AuditLedger;

  beforeEach(async () => {
    resetAuditLedger();
    ledger = new AuditLedger(1000); // Small limit for testing
    await ledger.initialize();
  });

  describe('initialization', () => {
    it('should initialize correctly', async () => {
      expect(ledger.isInitialized()).toBe(true);
    });

    it('should throw if not initialized', async () => {
      const uninitialized = new AuditLedger();
      expect(() => uninitialized.recordGateDecision(
        'test',
        'content',
        createTestMetadata('external-untrusted', 'test'),
        createTestScanResult('clean', 0),
        evaluateGate(createTestScanResult('clean', 0), 'external-untrusted', 'content'),
      )).toThrow('AuditLedger not initialized');
    });

    it('should clear entries on close', async () => {
      await ledger.recordGateDecision(
        'test-1',
        'content',
        createTestMetadata('external-untrusted', 'test'),
        createTestScanResult('clean', 10),
        evaluateGate(createTestScanResult('clean', 10), 'external-untrusted', 'content'),
      );

      await ledger.close();
      expect(ledger.isInitialized()).toBe(false);

      await ledger.initialize();
      const stats = await ledger.getStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('recordGateDecision', () => {
    it('should record a clean admit decision', async () => {
      const scanResult = createTestScanResult('clean', 10);
      const decision = evaluateGate(scanResult, 'internal', 'test content');

      const entry = await ledger.recordGateDecision(
        'content-1',
        'test content',
        createTestMetadata('internal', 'workspace'),
        scanResult,
        decision,
      );

      expect(entry.type).toBe('gate_decision');
      expect(entry.action).toBe('admit');
      expect(entry.scanVerdict).toBe('clean');
      expect(entry.trustTier).toBe('internal');
      expect(entry.requiresReview).toBe(false);
      expect(entry.metadata.contentLength).toBe(12);
      expect(entry.metadata.sourceOrigin).toBe('workspace');
    });

    it('should record a suspicious quarantine decision', async () => {
      const scanResult = createTestScanResult('suspicious', 50);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test content', STRICT_GATE_POLICY);

      const entry = await ledger.recordGateDecision(
        'content-2',
        'test content',
        createTestMetadata('external-untrusted', 'moltbook'),
        scanResult,
        decision,
      );

      expect(entry.action).toBe('quarantine');
      expect(entry.scanVerdict).toBe('suspicious');
      expect(entry.requiresReview).toBe(true);
      expect(entry.confidenceCap).toBeLessThanOrEqual(0.3);
    });

    it('should record a hostile reject decision', async () => {
      const scanResult = createTestScanResult('hostile', 80);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test content');

      const entry = await ledger.recordGateDecision(
        'content-3',
        'test content',
        createTestMetadata('external-untrusted', 'unknown'),
        scanResult,
        decision,
      );

      expect(entry.action).toBe('reject');
      expect(entry.scanVerdict).toBe('hostile');
      expect(entry.requiresReview).toBe(false);
      expect(entry.confidenceCap).toBe(0);
    });

    it('should record a sanitize-admit decision', async () => {
      const scanResult = createTestScanResult('suspicious', 25);
      const decision = evaluateGate(scanResult, 'external-verified', 'test content');

      const entry = await ledger.recordGateDecision(
        'content-4',
        'test content',
        createTestMetadata('external-verified', 'verified-source'),
        scanResult,
        decision,
      );

      expect(entry.action).toBe('sanitize-admit');
      expect(entry.confidenceCap).toBeLessThanOrEqual(0.5);
    });

    it('should generate unique audit IDs', async () => {
      const scanResult = createTestScanResult('clean', 5);
      const decision = evaluateGate(scanResult, 'internal', 'content');
      const metadata = createTestMetadata('internal', 'workspace');

      const entry1 = await ledger.recordGateDecision('c1', 'content', metadata, scanResult, decision);
      const entry2 = await ledger.recordGateDecision('c2', 'content', metadata, scanResult, decision);

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.id).toMatch(/^aud_\d+_/);
    });
  });

  describe('recordReviewAction', () => {
    it('should record a review approval', async () => {
      // First record the gate decision
      const scanResult = createTestScanResult('suspicious', 40);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test');
      const metadata = createTestMetadata('external-untrusted', 'moltbook');

      await ledger.recordGateDecision('content-5', 'test', metadata, scanResult, decision);

      // Then record the review
      const reviewEntry = await ledger.recordReviewAction({
        contentId: 'content-5',
        reviewer: 'admin-1',
        decision: 'approve',
        notes: 'Reviewed and approved',
        timestamp: Date.now(),
      });

      expect(reviewEntry.type).toBe('review_action');
      expect(reviewEntry.action).toBe('approve');
      expect(reviewEntry.reviewer).toBe('admin-1');
      expect(reviewEntry.reviewNotes).toBe('Reviewed and approved');
      expect(reviewEntry.trustTier).toBe('external-untrusted');
    });

    it('should record a review rejection', async () => {
      const scanResult = createTestScanResult('suspicious', 45);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test');
      const metadata = createTestMetadata('external-untrusted', 'moltbook');

      await ledger.recordGateDecision('content-6', 'test', metadata, scanResult, decision);

      const reviewEntry = await ledger.recordReviewAction({
        contentId: 'content-6',
        reviewer: 'admin-2',
        decision: 'reject',
        notes: 'Too suspicious',
        timestamp: Date.now(),
      });

      expect(reviewEntry.action).toBe('reject_review');
      expect(reviewEntry.reason).toContain('reject');
    });

    it('should handle review for unknown content', async () => {
      const reviewEntry = await ledger.recordReviewAction({
        contentId: 'unknown-content',
        reviewer: 'admin-3',
        decision: 'reject',
        timestamp: Date.now(),
      });

      expect(reviewEntry.type).toBe('review_action');
      expect(reviewEntry.trustTier).toBe('unknown');
    });
  });

  describe('recordExpiration', () => {
    it('should record an expiration event', async () => {
      const scanResult = createTestScanResult('suspicious', 35);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test');
      const metadata = createTestMetadata('external-untrusted', 'moltbook');

      await ledger.recordGateDecision('content-7', 'test', metadata, scanResult, decision);

      const expirationEntry = await ledger.recordExpiration('content-7', decision);

      expect(expirationEntry.type).toBe('expiration');
      expect(expirationEntry.action).toBe('expire');
      expect(expirationEntry.contentId).toBe('content-7');
    });
  });

  describe('recordSystemEvent', () => {
    it('should record a system event', async () => {
      const entry = await ledger.recordSystemEvent('Ledger initialized', { version: '1.0.0' });

      expect(entry.type).toBe('system_event');
      expect(entry.contentId).toBe('system');
      expect(entry.reason).toBe('Ledger initialized');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Seed with test data
      const decisions = [
        { verdict: 'clean' as const, tier: 'internal' as const, action: 'admit' },
        { verdict: 'suspicious' as const, tier: 'external-untrusted' as const, action: 'quarantine' },
        { verdict: 'hostile' as const, tier: 'external-untrusted' as const, action: 'reject' },
        { verdict: 'clean' as const, tier: 'external-verified' as const, action: 'admit' },
        { verdict: 'suspicious' as const, tier: 'internal-generated' as const, action: 'sanitize-admit' },
      ];

      for (let i = 0; i < decisions.length; i++) {
        const { verdict, tier, action } = decisions[i]!;
        const score = verdict === 'clean' ? 10 : verdict === 'suspicious' ? 40 : 80;
        const scanResult = createTestScanResult(verdict, score);
        const policy = verdict === 'suspicious' ? STRICT_GATE_POLICY : DEFAULT_GATE_POLICY;
        const decision = evaluateGate(scanResult, tier, 'content', policy);
        const metadata = createTestMetadata(tier, 'test-origin');

        await ledger.recordGateDecision(`content-${i}`, 'content', metadata, scanResult, decision);
      }
    });

    it('should query by type', async () => {
      const entries = await ledger.query({ type: 'gate_decision' });
      expect(entries.length).toBe(5);
    });

    it('should query by action', async () => {
      const entries = await ledger.query({ action: 'admit' });
      expect(entries.length).toBe(2);
    });

    it('should query by trust tier', async () => {
      const entries = await ledger.query({ trustTier: 'external-untrusted' });
      expect(entries.length).toBe(2);
    });

    it('should query by scan verdict', async () => {
      const entries = await ledger.query({ scanVerdict: 'suspicious' });
      expect(entries.length).toBe(2);
    });

    it('should query by content ID', async () => {
      const entries = await ledger.query({ contentId: 'content-0' });
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('admit');
    });

    it('should query by requiresReview', async () => {
      const entries = await ledger.query({ requiresReview: true });
      // Both suspicious items use STRICT policy (per seeded data logic: verdict === 'suspicious' ? STRICT : DEFAULT)
      // With STRICT policy, suspicious content is always quarantined for review
      expect(entries.length).toBe(2);
      expect(entries.every(e => e.action === 'quarantine')).toBe(true);
    });

    it('should limit results', async () => {
      const entries = await ledger.query({ limit: 2 });
      expect(entries.length).toBe(2);
    });

    it('should offset results', async () => {
      const allEntries = await ledger.query();
      const offsetEntries = await ledger.query({ offset: 2, limit: 2 });

      expect(offsetEntries.length).toBe(2);
      expect(offsetEntries[0]!.id).toBe(allEntries[2]!.id);
    });

    it('should sort by timestamp descending', async () => {
      const entries = await ledger.query({ limit: 3 });

      for (let i = 0; i < entries.length - 1; i++) {
        expect(entries[i]!.timestamp).toBeGreaterThanOrEqual(entries[i + 1]!.timestamp);
      }
    });
  });

  describe('getContentHistory', () => {
    it('should return all entries for a content ID', async () => {
      const scanResult = createTestScanResult('suspicious', 45);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test');
      const metadata = createTestMetadata('external-untrusted', 'moltbook');

      await ledger.recordGateDecision('tracked-content', 'test', metadata, scanResult, decision);
      await ledger.recordReviewAction({
        contentId: 'tracked-content',
        reviewer: 'admin',
        decision: 'approve',
        timestamp: Date.now(),
      });

      const history = await ledger.getContentHistory('tracked-content');
      expect(history.length).toBe(2);
      // Verify both types are present regardless of order
      const types = history.map(h => h.type);
      expect(types).toContain('gate_decision');
      expect(types).toContain('review_action');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      // Seed data
      for (let i = 0; i < 3; i++) {
        const scanResult = createTestScanResult('clean', 10);
        const decision = evaluateGate(scanResult, 'internal', 'content');
        const metadata = createTestMetadata('internal', 'workspace');
        await ledger.recordGateDecision(`c-${i}`, 'content', metadata, scanResult, decision);
      }

      const stats = await ledger.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.byType.gate_decision).toBe(3);
      expect(stats.byAction.admit).toBe(3);
      expect(stats.byTrustTier.internal).toBe(3);
    });

    it('should track date range', async () => {
      const before = Date.now();

      const scanResult = createTestScanResult('clean', 5);
      const decision = evaluateGate(scanResult, 'internal', 'content');
      const metadata = createTestMetadata('internal', 'test');
      await ledger.recordGateDecision('date-test', 'content', metadata, scanResult, decision);

      const after = Date.now();
      const stats = await ledger.getStats();

      expect(stats.dateRange.earliest).toBeGreaterThanOrEqual(before);
      expect(stats.dateRange.latest).toBeLessThanOrEqual(after);
    });

    it('should handle empty ledger', async () => {
      const stats = await ledger.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.dateRange.earliest).toBe(0);
      expect(stats.dateRange.latest).toBe(0);
    });
  });

  describe('getDecisionDistribution', () => {
    it('should return action counts', async () => {
      const decisions = [
        { verdict: 'clean' as const, tier: 'internal' as const },
        { verdict: 'suspicious' as const, tier: 'external-untrusted' as const },
        { verdict: 'clean' as const, tier: 'external-verified' as const },
      ];

      for (let i = 0; i < decisions.length; i++) {
        const { verdict, tier } = decisions[i]!;
        const score = verdict === 'clean' ? 10 : 35;
        const scanResult = createTestScanResult(verdict, score);
        const policy = verdict === 'suspicious' ? STRICT_GATE_POLICY : DEFAULT_GATE_POLICY;
        const decision = evaluateGate(scanResult, tier, 'content', policy);
        const metadata = createTestMetadata(tier, 'test');

        await ledger.recordGateDecision(`dist-${i}`, 'content', metadata, scanResult, decision);
      }

      const distribution = await ledger.getDecisionDistribution();
      expect(distribution.admit).toBe(2);
      expect(distribution.quarantine).toBe(1);
    });
  });

  describe('generateReport', () => {
    it('should generate a human-readable report', async () => {
      const scanResult = createTestScanResult('clean', 10);
      const decision = evaluateGate(scanResult, 'internal', 'content');
      const metadata = createTestMetadata('internal', 'workspace');
      await ledger.recordGateDecision('report-test', 'content', metadata, scanResult, decision);

      const report = await ledger.generateReport();

      expect(report).toContain('Quarantine Audit Ledger Report');
      expect(report).toContain('Total Entries: 1');
      expect(report).toContain('gate_decision: 1');
      expect(report).toContain('admit: 1');
      expect(report).toContain('internal: 1');
    });
  });

  describe('retention limit', () => {
    it('should enforce max entries limit', async () => {
      const smallLedger = new AuditLedger(5);
      await smallLedger.initialize();

      const scanResult = createTestScanResult('clean', 5);
      const decision = evaluateGate(scanResult, 'internal', 'content');
      const metadata = createTestMetadata('internal', 'test');

      // Add 10 entries
      for (let i = 0; i < 10; i++) {
        await smallLedger.recordGateDecision(`retention-${i}`, 'content', metadata, scanResult, decision);
      }

      const stats = await smallLedger.getStats();
      expect(stats.totalEntries).toBe(5); // Limited to 5
    });
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe('AuditLedger Singleton', () => {
  beforeEach(() => {
    resetAuditLedger();
  });

  it('should return the same instance', () => {
    const ledger1 = getAuditLedger();
    const ledger2 = getAuditLedger();
    expect(ledger1).toBe(ledger2);
  });

  it('should reset to new instance', async () => {
    const ledger1 = getAuditLedger();
    await ledger1.initialize();

    await ledger1.recordGateDecision(
      'singleton-test',
      'content',
      createTestMetadata('internal', 'test'),
      createTestScanResult('clean', 5),
      evaluateGate(createTestScanResult('clean', 5), 'internal', 'content'),
    );

    resetAuditLedger();
    const ledger2 = getAuditLedger();
    expect(ledger2).not.toBe(ledger1);

    await ledger2.initialize();
    const stats = await ledger2.getStats();
    expect(stats.totalEntries).toBe(0); // Fresh instance
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe('Convenience Functions', () => {
  beforeEach(async () => {
    resetAuditLedger();
    const ledger = getAuditLedger();
    await ledger.initialize();
  });

  describe('auditGateDecision', () => {
    it('should record and return audit entry', async () => {
      const scanResult = createTestScanResult('suspicious', 45);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test content');
      const metadata = createTestMetadata('external-untrusted', 'moltbook');

      const entry = await auditGateDecision('conv-test', 'test content', metadata, scanResult, decision);

      expect(entry.type).toBe('gate_decision');
      expect(entry.action).toBe('sanitize-admit'); // Score 45 < 49 (70*0.7) with default policy
      expect(entry.contentId).toBe('conv-test');
    });
  });

  describe('auditReviewAction', () => {
    it('should record and return review entry', async () => {
      // Seed with gate decision first
      const scanResult = createTestScanResult('suspicious', 40);
      const decision = evaluateGate(scanResult, 'external-untrusted', 'test');
      const metadata = createTestMetadata('external-untrusted', 'moltbook');
      await auditGateDecision('review-test', 'test', metadata, scanResult, decision);

      const entry = await auditReviewAction('review-test', 'admin-1', 'approve', 'Looks good');

      expect(entry.type).toBe('review_action');
      expect(entry.reviewer).toBe('admin-1');
      expect(entry.reviewNotes).toBe('Looks good');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration with quarantine-gate and quarantine-store', () => {
  let ledger: AuditLedger;

  beforeEach(async () => {
    resetAuditLedger();
    ledger = getAuditLedger();
    await ledger.initialize();
  });

  it('should audit all gate actions correctly', async () => {
    const testCases = [
      { verdict: 'clean' as const, score: 10, tier: 'internal' as const, expected: 'admit' },
      { verdict: 'clean' as const, score: 15, tier: 'external-verified' as const, expected: 'admit' },
      { verdict: 'suspicious' as const, score: 25, tier: 'external-verified' as const, expected: 'sanitize-admit' },
      { verdict: 'suspicious' as const, score: 50, tier: 'external-untrusted' as const, expected: 'quarantine' },
      { verdict: 'hostile' as const, score: 80, tier: 'external-untrusted' as const, expected: 'reject' },
    ];

    for (const { verdict, score, tier, expected } of testCases) {
      const scanResult = createTestScanResult(verdict, score);
      const decision = evaluateGate(scanResult, tier, 'test');
      const metadata = createTestMetadata(tier, 'integration-test');

      const entry = await ledger.recordGateDecision(
        `int-${verdict}-${tier}`,
        'test',
        metadata,
        scanResult,
        decision,
      );

      expect(entry.action).toBe(expected);
      expect(entry.scanVerdict).toBe(verdict);
      expect(entry.trustTier).toBe(tier);
    }

    const stats = await ledger.getStats();
    expect(stats.totalEntries).toBe(5);
    expect(stats.byAction.admit).toBe(2);
    expect(stats.byAction['sanitize-admit']).toBe(1);
    expect(stats.byAction.quarantine).toBe(1);
    expect(stats.byAction.reject).toBe(1);
  });

  it('should track full content lifecycle', async () => {
    const contentId = 'lifecycle-test';

    // 1. Initial gate decision (quarantine)
    const scanResult = createTestScanResult('suspicious', 45);
    const decision = evaluateGate(scanResult, 'external-untrusted', 'content');
    const metadata = createTestMetadata('external-untrusted', 'moltbook');

    await ledger.recordGateDecision(contentId, 'content', metadata, scanResult, decision);

    // 2. Manual review (approve)
    await ledger.recordReviewAction({
      contentId,
      reviewer: 'admin',
      decision: 'approve',
      notes: 'Approved after review',
      timestamp: Date.now(),
    });

    // 3. Get history
    const history = await ledger.getContentHistory(contentId);

    expect(history.length).toBe(2);
    // Verify both types are present regardless of order
    const types = history.map(h => h.type);
    expect(types).toContain('gate_decision');
    expect(types).toContain('review_action');
    
    // Find the review entry and verify reviewer
    const reviewEntry = history.find(h => h.type === 'review_action');
    expect(reviewEntry).toBeDefined();
    expect(reviewEntry!.reviewer).toBe('admin');

    // Verify audit trail
    const report = await ledger.generateReport();
    expect(report).toContain('gate_decision: 1');
    expect(report).toContain('review_action: 1');
  });
});
