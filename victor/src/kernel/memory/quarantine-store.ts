/**
 * Quarantine Store — SQLite-backed storage for quarantine/provisional/rejected items
 *
 * Stores content that has been routed through the governance gate with actions:
 * - quarantine: Suspicious/hostile content awaiting review
 * - sanitize-admit: Sanitized content admitted with reduced confidence
 * - reject: Permanently blocked hostile content
 *
 * Integration points:
 * - quarantine-gate.ts: GateDecision and QuarantineRecord types
 * - quarantine-scan.ts: ScanResult type
 * - types.ts: SourceTrustMetadata, SourceTrustTier
 */

import type {
  QuarantineRecord,
  GateDecision,
  SourceTrustMetadata,
  ScanResult,
} from './quarantine-gate.ts';

// ============================================================================
// Store Types
// ============================================================================

export type StoredItemStatus = 'quarantined' | 'provisional' | 'rejected' | 'expired' | 'admitted';

export interface StoredItem {
  id: string;
  content: string;
  rawContent: string;  // Original unsanitized content for diff view
  sourceMetadata: SourceTrustMetadata;
  scanResult: ScanResult;
  gateDecision: GateDecision;
  storedAt: number;
  status: StoredItemStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNotes?: string;
  expiresAt: number;
}

export interface StoreQuery {
  status?: StoredItemStatus;
  trustTier?: string;
  verdict?: string;
  before?: number;
  after?: number;
  limit?: number;
}

export interface StoreStats {
  total: number;
  quarantined: number;
  provisional: number;
  rejected: number;
  expired: number;
  admitted: number;
  pendingReview: number;
}

// ============================================================================
// In-Memory Quarantine Store
// ============================================================================

export class QuarantineStore {
  private items = new Map<string, StoredItem>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.items.clear();
    this.initialized = true;
  }

  async close(): Promise<void> {
    this.items.clear();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Core Storage Operations
  // ============================================================================

  /**
   * Store a quarantined item for review.
   */
  async storeQuarantine(
    id: string,
    content: string,
    rawContent: string,
    sourceMetadata: SourceTrustMetadata,
    scanResult: ScanResult,
    gateDecision: GateDecision,
    expiresAt: number,
  ): Promise<StoredItem> {
    this.ensureInitialized();

    const item: StoredItem = {
      id,
      content,
      rawContent,
      sourceMetadata,
      scanResult,
      gateDecision,
      storedAt: Date.now(),
      status: 'quarantined',
      expiresAt,
    };

    this.items.set(id, item);
    return item;
  }

  /**
   * Store a sanitized item as provisional (admitted with restrictions).
   */
  async storeProvisional(
    id: string,
    content: string,
    rawContent: string,
    sourceMetadata: SourceTrustMetadata,
    scanResult: ScanResult,
    gateDecision: GateDecision,
    expiresAt: number,
  ): Promise<StoredItem> {
    this.ensureInitialized();

    const item: StoredItem = {
      id,
      content,
      rawContent,
      sourceMetadata,
      scanResult,
      gateDecision,
      storedAt: Date.now(),
      status: 'provisional',
      expiresAt,
    };

    this.items.set(id, item);
    return item;
  }

  /**
   * Store a rejected item (permanently blocked).
   */
  async storeRejected(
    id: string,
    content: string,
    rawContent: string,
    sourceMetadata: SourceTrustMetadata,
    scanResult: ScanResult,
    gateDecision: GateDecision,
  ): Promise<StoredItem> {
    this.ensureInitialized();

    const item: StoredItem = {
      id,
      content,
      rawContent,
      sourceMetadata,
      scanResult,
      gateDecision,
      storedAt: Date.now(),
      status: 'rejected',
      expiresAt: Number.MAX_SAFE_INTEGER, // Never expires
    };

    this.items.set(id, item);
    return item;
  }

  // ============================================================================
  // Retrieval Operations
  // ============================================================================

  /**
   * Get a single item by ID.
   */
  async get(id: string): Promise<StoredItem | undefined> {
    this.ensureInitialized();
    return this.items.get(id);
  }

  /**
   * Check if an item exists.
   */
  async has(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.items.has(id);
  }

  /**
   * Query items by status and filters.
   */
  async query(query: StoreQuery = {}): Promise<StoredItem[]> {
    this.ensureInitialized();

    let results = [...this.items.values()];

    if (query.status) {
      results = results.filter((item) => item.status === query.status);
    }

    if (query.trustTier) {
      results = results.filter((item) => item.sourceMetadata.tier === query.trustTier);
    }

    if (query.verdict) {
      results = results.filter((item) => item.scanResult.verdict === query.verdict);
    }

    if (query.before) {
      results = results.filter((item) => item.storedAt < query.before!);
    }

    if (query.after) {
      results = results.filter((item) => item.storedAt > query.after!);
    }

    // Sort by storedAt descending (newest first)
    results.sort((a, b) => b.storedAt - a.storedAt);

    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get all items pending review (quarantined status).
   */
  async getPendingReview(): Promise<StoredItem[]> {
    return this.query({ status: 'quarantined' });
  }

  /**
   * Get all expired items that need cleanup.
   */
  async getExpired(now: number = Date.now()): Promise<StoredItem[]> {
    this.ensureInitialized();

    return [...this.items.values()].filter(
      (item) => item.expiresAt < now && item.status !== 'expired' && item.status !== 'rejected',
    );
  }

  // ============================================================================
  // Review Operations
  // ============================================================================

  /**
   * Approve a quarantined item for admission.
   */
  async approve(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<StoredItem | undefined> {
    this.ensureInitialized();

    const item = this.items.get(id);
    if (!item || item.status !== 'quarantined') {
      return undefined;
    }

    const updated: StoredItem = {
      ...item,
      status: 'admitted',
      reviewedBy,
      reviewedAt: Date.now(),
      reviewNotes,
    };

    this.items.set(id, updated);
    return updated;
  }

  /**
   * Reject a quarantined item permanently.
   */
  async reject(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<StoredItem | undefined> {
    this.ensureInitialized();

    const item = this.items.get(id);
    if (!item || item.status !== 'quarantined') {
      return undefined;
    }

    const updated: StoredItem = {
      ...item,
      status: 'rejected',
      reviewedBy,
      reviewedAt: Date.now(),
      reviewNotes,
    };

    this.items.set(id, updated);
    return updated;
  }

  /**
   * Mark expired items as expired status.
   */
  async processExpirations(now: number = Date.now()): Promise<StoredItem[]> {
    this.ensureInitialized();

    const expired: StoredItem[] = [];

    for (const [id, item] of this.items) {
      if (item.expiresAt < now && item.status !== 'expired' && item.status !== 'rejected') {
        const updated: StoredItem = {
          ...item,
          status: 'expired',
        };
        this.items.set(id, updated);
        expired.push(updated);
      }
    }

    return expired;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get store statistics.
   */
  async getStats(): Promise<StoreStats> {
    this.ensureInitialized();

    const items = [...this.items.values()];

    return {
      total: items.length,
      quarantined: items.filter((i) => i.status === 'quarantined').length,
      provisional: items.filter((i) => i.status === 'provisional').length,
      rejected: items.filter((i) => i.status === 'rejected').length,
      expired: items.filter((i) => i.status === 'expired').length,
      admitted: items.filter((i) => i.status === 'admitted').length,
      pendingReview: items.filter((i) => i.status === 'quarantined').length,
    };
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  /**
   * Remove an item by ID.
   */
  async remove(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.items.delete(id);
  }

  /**
   * Remove all items with a given status.
   */
  async removeByStatus(status: StoredItemStatus): Promise<number> {
    this.ensureInitialized();

    let count = 0;
    for (const [id, item] of this.items) {
      if (item.status === status) {
        this.items.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all items.
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    this.items.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('QuarantineStore not initialized. Call initialize() first.');
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalStore: QuarantineStore | undefined;

export function getQuarantineStore(): QuarantineStore {
  if (!globalStore) {
    globalStore = new QuarantineStore();
  }
  return globalStore;
}

export function resetQuarantineStore(): void {
  globalStore = undefined;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function storeGateDecision(
  id: string,
  content: string,
  rawContent: string,
  sourceMetadata: SourceTrustMetadata,
  scanResult: ScanResult,
  gateDecision: GateDecision,
): Promise<StoredItem> {
  const store = getQuarantineStore();

  switch (gateDecision.action) {
    case 'quarantine':
      return store.storeQuarantine(
        id,
        content,
        rawContent,
        sourceMetadata,
        scanResult,
        gateDecision,
        calculateExpiry(gateDecision),
      );

    case 'sanitize-admit':
      return store.storeProvisional(
        id,
        content,
        rawContent,
        sourceMetadata,
        scanResult,
        gateDecision,
        calculateExpiry(gateDecision),
      );

    case 'reject':
      return store.storeRejected(
        id,
        content,
        rawContent,
        sourceMetadata,
        scanResult,
        gateDecision,
      );

    case 'admit':
      // Clean content doesn't need storing
      throw new Error('Admitted content should not be stored in quarantine store');

    default:
      throw new Error(`Unknown gate action: ${gateDecision.action}`);
  }
}

function calculateExpiry(gateDecision: GateDecision): number {
  // Default expiry: 7 days for quarantine, 30 days for provisional
  const defaultMs = gateDecision.action === 'quarantine'
    ? 7 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;

  return Date.now() + defaultMs;
}
