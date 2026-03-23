/**
 * Quarantine Store Tests
 *
 * Tests for the in-memory quarantine store implementation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  QuarantineStore,
  getQuarantineStore,
  resetQuarantineStore,
  storeGateDecision,
  type StoredItem,
} from './quarantine-store.js';
import type { GateDecision, SourceTrustMetadata, ScanResult } from './quarantine-gate.js';

describe('QuarantineStore', () => {
  let store: QuarantineStore;

  beforeEach(async () => {
    resetQuarantineStore();
    store = getQuarantineStore();
    await store.initialize();
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const freshStore = new QuarantineStore();
      await freshStore.initialize();
      expect(freshStore.isInitialized()).toBe(true);
    });

    it('should throw when not initialized', async () => {
      const freshStore = new QuarantineStore();
      expect(() => freshStore.getStats()).toThrow('QuarantineStore not initialized');
    });

    it('should clear items on close', async () => {
      await store.storeRejected('test-1', 'test-1', 'test-1', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      await store.close();
      expect(store.isInitialized()).toBe(false);
    });
  });

  // ============================================================================
  // Store Operations
  // ============================================================================

  describe('storeQuarantine', () => {
    it('should store quarantined item', async () => {
      const item = await store.storeQuarantine(
        'test-1',
        'suspicious content',
        'raw suspicious content',
        createTrustMetadata('external-untrusted'),
        createScanResult('suspicious'),
        createGateDecision('quarantine'),
        Date.now() + 86400000,
      );

      expect(item.id).toBe('test-1');
      expect(item.status).toBe('quarantined');
      expect(item.content).toBe('suspicious content');
      expect(item.rawContent).toBe('raw suspicious content');
      expect(item.sourceMetadata.tier).toBe('external-untrusted');
    });

    it('should track stored timestamp', async () => {
      const before = Date.now();
      const item = await store.storeQuarantine(
        'test-1',
        'content',
        'raw content',
        createTrustMetadata('external-untrusted'),
        createScanResult('suspicious'),
        createGateDecision('quarantine'),
        Date.now() + 86400000,
      );
      const after = Date.now();

      expect(item.storedAt).toBeGreaterThanOrEqual(before);
      expect(item.storedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('storeProvisional', () => {
    it('should store provisional item', async () => {
      const item = await store.storeProvisional(
        'test-1',
        'sanitized content',
        '<script>alert(1)</script>raw content',
        createTrustMetadata('external-untrusted'),
        createScanResult('suspicious'),
        createGateDecision('sanitize-admit'),
        Date.now() + 86400000,
      );

      expect(item.id).toBe('test-1');
      expect(item.status).toBe('provisional');
      expect(item.content).toBe('sanitized content');
      expect(item.rawContent).toBe('<script>alert(1)</script>raw content');
    });
  });

  describe('storeRejected', () => {
    it('should store rejected item', async () => {
      const item = await store.storeRejected(
        'test-1',
        'hostile content',
        'raw hostile content',
        createTrustMetadata('external-untrusted'),
        createScanResult('hostile'),
        createGateDecision('reject'),
      );

      expect(item.id).toBe('test-1');
      expect(item.status).toBe('rejected');
      expect(item.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
      expect(item.rawContent).toBe('raw hostile content');
    });
  });

  // ============================================================================
  // Retrieval
  // ============================================================================

  describe('get', () => {
    it('should retrieve stored item', async () => {
      await store.storeRejected('test-1', 'test-1', 'test-1', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      const item = await store.get('test-1');

      expect(item).toBeDefined();
      expect(item?.id).toBe('test-1');
    });

    it('should return undefined for unknown id', async () => {
      const item = await store.get('unknown');
      expect(item).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing item', async () => {
      await store.storeRejected('test-1', 'test-1', 'test-1', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      expect(await store.has('test-1')).toBe(true);
    });

    it('should return false for unknown item', async () => {
      expect(await store.has('unknown')).toBe(false);
    });
  });

  // ============================================================================
  // Querying
  // ============================================================================

  describe('query', () => {
    beforeEach(async () => {
      // Setup mixed items
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);
      await store.storeProvisional('p-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('sanitize-admit'), Date.now() + 86400000);
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
    });

    it('should query by status', async () => {
      const quarantined = await store.query({ status: 'quarantined' });
      expect(quarantined).toHaveLength(1);
      expect(quarantined[0].id).toBe('q-1');
    });

    it('should query by trust tier', async () => {
      const items = await store.query({ trustTier: 'external-untrusted' });
      expect(items).toHaveLength(3);
    });

    it('should query by verdict', async () => {
      const hostile = await store.query({ verdict: 'hostile' });
      expect(hostile).toHaveLength(1);
      expect(hostile[0].id).toBe('r-1');
    });

    it('should apply limit', async () => {
      const limited = await store.query({ limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('should sort by storedAt descending', async () => {
      await new Promise((r) => setTimeout(r, 10));
      await store.storeRejected('r-2', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));

      const items = await store.query();
      expect(items[0].id).toBe('r-2'); // Most recent
    });
  });

  describe('getPendingReview', () => {
    it('should return only quarantined items', async () => {
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));

      const pending = await store.getPendingReview();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('q-1');
    });
  });

  describe('getExpired', () => {
    it('should return items past expiry', async () => {
      const pastExpiry = Date.now() - 1000;
      await store.storeQuarantine('expired-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), pastExpiry);
      await store.storeQuarantine('valid-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);

      const expired = await store.getExpired();
      expect(expired).toHaveLength(1);
      expect(expired[0].id).toBe('expired-1');
    });

    it('should not return rejected items as expired', async () => {
      // Rejected items have MAX_SAFE_INTEGER expiry but should not be considered expired
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));

      const expired = await store.getExpired();
      expect(expired).toHaveLength(0);
    });
  });

  // ============================================================================
  // Review Operations
  // ============================================================================

  describe('approve', () => {
    it('should approve quarantined item', async () => {
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);

      const approved = await store.approve('q-1', 'reviewer-1', 'Looks safe');

      expect(approved).toBeDefined();
      expect(approved?.status).toBe('admitted');
      expect(approved?.reviewedBy).toBe('reviewer-1');
      expect(approved?.reviewNotes).toBe('Looks safe');
      expect(approved?.reviewedAt).toBeDefined();
    });

    it('should return undefined for non-quarantined item', async () => {
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));

      const approved = await store.approve('r-1', 'reviewer-1');
      expect(approved).toBeUndefined();
    });

    it('should return undefined for unknown id', async () => {
      const approved = await store.approve('unknown', 'reviewer-1');
      expect(approved).toBeUndefined();
    });
  });

  describe('reject', () => {
    it('should reject quarantined item', async () => {
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);

      const rejected = await store.reject('q-1', 'reviewer-1', 'Confirmed hostile');

      expect(rejected).toBeDefined();
      expect(rejected?.status).toBe('rejected');
      expect(rejected?.reviewedBy).toBe('reviewer-1');
    });

    it('should return undefined for non-quarantined item', async () => {
      await store.storeProvisional('p-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('sanitize-admit'), Date.now() + 86400000);

      const rejected = await store.reject('p-1', 'reviewer-1');
      expect(rejected).toBeUndefined();
    });
  });

  describe('processExpirations', () => {
    it('should mark expired items', async () => {
      const pastExpiry = Date.now() - 1000;
      await store.storeQuarantine('expired-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), pastExpiry);

      const expired = await store.processExpirations();

      expect(expired).toHaveLength(1);
      expect(expired[0].status).toBe('expired');

      const item = await store.get('expired-1');
      expect(item?.status).toBe('expired');
    });

    it('should not mark valid items', async () => {
      await store.storeQuarantine('valid-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);

      const expired = await store.processExpirations();
      expect(expired).toHaveLength(0);
    });

    it('should not mark rejected items as expired', async () => {
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));

      const expired = await store.processExpirations();
      expect(expired).toHaveLength(0);
    });
  });

  // ============================================================================
  // Statistics
  // ============================================================================

  describe('getStats', () => {
    it('should return zero for empty store', async () => {
      const stats = await store.getStats();

      expect(stats.total).toBe(0);
      expect(stats.quarantined).toBe(0);
      expect(stats.rejected).toBe(0);
    });

    it('should count items by status', async () => {
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);
      await store.storeQuarantine('q-2', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      await store.storeProvisional('p-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('sanitize-admit'), Date.now() + 86400000);

      const stats = await store.getStats();

      expect(stats.total).toBe(4);
      expect(stats.quarantined).toBe(2);
      expect(stats.rejected).toBe(1);
      expect(stats.provisional).toBe(1);
      expect(stats.pendingReview).toBe(2);
    });
  });

  // ============================================================================
  // Cleanup
  // ============================================================================

  describe('remove', () => {
    it('should remove item', async () => {
      await store.storeRejected('test-1', 'test-1', 'test-1', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));

      const removed = await store.remove('test-1');

      expect(removed).toBe(true);
      expect(await store.has('test-1')).toBe(false);
    });

    it('should return false for unknown id', async () => {
      const removed = await store.remove('unknown');
      expect(removed).toBe(false);
    });
  });

  describe('removeByStatus', () => {
    it('should remove items by status', async () => {
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      await store.storeRejected('r-2', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);

      const removed = await store.removeByStatus('rejected');

      expect(removed).toBe(2);
      expect(await store.getStats()).toEqual(expect.objectContaining({ rejected: 0, total: 1 }));
    });
  });

  describe('clear', () => {
    it('should remove all items', async () => {
      await store.storeRejected('r-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('hostile'), createGateDecision('reject'));
      await store.storeQuarantine('q-1', 'content', 'raw content', createTrustMetadata('external-untrusted'), createScanResult('suspicious'), createGateDecision('quarantine'), Date.now() + 86400000);

      await store.clear();

      const stats = await store.getStats();
      expect(stats.total).toBe(0);
    });
  });

  // ============================================================================
  // Convenience Functions
  // ============================================================================

  describe('storeGateDecision', () => {
    it('should store quarantine action', async () => {
      const item = await storeGateDecision(
        'test-1',
        'content',
        'raw content',
        createTrustMetadata('external-untrusted'),
        createScanResult('suspicious'),
        createGateDecision('quarantine'),
      );

      expect(item.status).toBe('quarantined');
    });

    it('should store sanitize-admit as provisional', async () => {
      const item = await storeGateDecision(
        'test-1',
        'content',
        'raw content',
        createTrustMetadata('external-untrusted'),
        createScanResult('suspicious'),
        createGateDecision('sanitize-admit'),
      );

      expect(item.status).toBe('provisional');
    });

    it('should store reject action', async () => {
      const item = await storeGateDecision(
        'test-1',
        'content',
        'raw content',
        createTrustMetadata('external-untrusted'),
        createScanResult('hostile'),
        createGateDecision('reject'),
      );

      expect(item.status).toBe('rejected');
    });

    it('should throw for admit action', async () => {
      expect(
        storeGateDecision(
          'test-1',
          'content',
          'raw content',
          createTrustMetadata('external-untrusted'),
          createScanResult('clean'),
          createGateDecision('admit'),
        ),
      ).rejects.toThrow('Admitted content should not be stored in quarantine store');
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createTrustMetadata(tier: 'external-untrusted' | 'external-verified' | 'internal' | 'internal-generated'): SourceTrustMetadata {
  return {
    tier,
    origin: 'test',
    fetchedAt: new Date().toISOString(),
    scanVerdict: 'suspicious',
    scanDetails: [],
    confidenceCap: 0.5,
  };
}

function createScanResult(verdict: 'clean' | 'suspicious' | 'hostile'): ScanResult {
  return {
    verdict,
    score: verdict === 'hostile' ? 80 : verdict === 'suspicious' ? 40 : 10,
    details: [],
    scannedAt: Date.now(),
  };
}

function createGateDecision(action: 'admit' | 'sanitize-admit' | 'quarantine' | 'reject'): GateDecision {
  return {
    action,
    confidenceCap: 0.5,
    recommendedGovernanceState: action === 'reject' ? 'rejected' : action === 'quarantine' ? 'quarantined' : 'provisional',
    recommendedEpistemicType: 'source-claim',
    requiresReview: action === 'quarantine',
    reason: `Test ${action} decision`,
    audit: {
      gateVersion: '1.0.0',
      decidedAt: Date.now(),
      scanScore: 40,
      trustTier: 'external-untrusted',
      appliedPolicy: 'production',
    },
  };
}
