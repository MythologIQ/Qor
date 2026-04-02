/**
 * Quarantine Audit Ledger — Persistent audit logging for gate decisions
 *
 * Records all gate decisions (admit, sanitize-admit, quarantine, reject) with
 * full traceability for compliance, debugging, and governance review.
 *
 * Integration points:
 * - quarantine-gate.ts: GateDecision, GateAuditRecord
 * - quarantine-store.ts: QuarantineStore for item storage
 * - types.ts: SourceTrustMetadata, ScanResult
 */

import type {
  GateDecision,
  GateAction,
  GateAuditRecord,
  QuarantineRecord,
} from './quarantine-gate.js';
import type { SourceTrustMetadata, ScanResult } from './types.js';

// ============================================================================
// Audit Ledger Types
// ============================================================================

export type AuditEntryType = 'gate_decision' | 'review_action' | 'expiration' | 'system_event';

export interface AuditEntry {
  id: string;
  type: AuditEntryType;
  timestamp: number;
  contentId: string;
  action: GateAction | 'approve' | 'reject_review' | 'expire' | 'system_init';
  trustTier: string;
  scanVerdict: string;
  scanScore: number;
  confidenceCap: number;
  gatePolicy: string;
  gateVersion: string;
  requiresReview: boolean;
  reason: string;
  reviewer?: string;
  reviewNotes?: string;
  metadata: {
    contentLength: number;
    sourceOrigin: string;
    sourceOriginId?: string;
    processedAt: number;
  };
}

export interface AuditQuery {
  type?: AuditEntryType;
  action?: string;
  trustTier?: string;
  scanVerdict?: string;
  contentId?: string;
  before?: number;
  after?: number;
  requiresReview?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  byType: Record<AuditEntryType, number>;
  byAction: Record<string, number>;
  byTrustTier: Record<string, number>;
  byScanVerdict: Record<string, number>;
  requiringReview: number;
  reviewed: number;
  dateRange: {
    earliest: number;
    latest: number;
  };
}

export interface ReviewAction {
  contentId: string;
  reviewer: string;
  decision: 'approve' | 'reject';
  notes?: string;
  timestamp: number;
}

// ============================================================================
// Audit Ledger Store
// ============================================================================

export class AuditLedger {
  private entries: AuditEntry[] = [];
  private initialized = false;
  private maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.entries = [];
    this.initialized = true;
  }

  async close(): Promise<void> {
    this.entries = [];
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Core Audit Operations
  // ============================================================================

  /**
   * Record a gate decision in the audit ledger.
   *
   * @param contentId - Unique identifier for the content
   * @param content - The content that was processed
   * @param sourceMetadata - Trust metadata for the source
   * @param scanResult - Scan result from quarantine-scan
   * @param gateDecision - Decision from evaluateGate
   * @returns The created audit entry
   */
  async recordGateDecision(
    contentId: string,
    content: string,
    sourceMetadata: SourceTrustMetadata,
    scanResult: ScanResult,
    gateDecision: GateDecision,
  ): Promise<AuditEntry> {
    this.ensureInitialized();

    const entry: AuditEntry = {
      id: generateAuditId(),
      type: 'gate_decision',
      timestamp: Date.now(),
      contentId,
      action: gateDecision.action,
      trustTier: sourceMetadata.tier,
      scanVerdict: scanResult.verdict,
      scanScore: scanResult.score,
      confidenceCap: gateDecision.confidenceCap,
      gatePolicy: gateDecision.audit.appliedPolicy,
      gateVersion: gateDecision.audit.gateVersion,
      requiresReview: gateDecision.requiresReview,
      reason: gateDecision.reason,
      metadata: {
        contentLength: content.length,
        sourceOrigin: sourceMetadata.origin,
        sourceOriginId: sourceMetadata.originId,
        processedAt: gateDecision.audit.decidedAt,
      },
    };

    this.entries.push(entry);
    this.enforceRetentionLimit();

    return entry;
  }

  /**
   * Record a manual review action in the audit ledger.
   *
   * @param reviewAction - The review action to record
   * @returns The created audit entry
   */
  async recordReviewAction(reviewAction: ReviewAction): Promise<AuditEntry> {
    this.ensureInitialized();

    // Find the original gate decision for this content
    const originalEntry = this.findLatestGateDecision(reviewAction.contentId);

    const entry: AuditEntry = {
      id: generateAuditId(),
      type: 'review_action',
      timestamp: reviewAction.timestamp,
      contentId: reviewAction.contentId,
      action: reviewAction.decision === 'approve' ? 'approve' : 'reject_review',
      trustTier: originalEntry?.trustTier ?? 'unknown',
      scanVerdict: originalEntry?.scanVerdict ?? 'unknown',
      scanScore: originalEntry?.scanScore ?? 0,
      confidenceCap: originalEntry?.confidenceCap ?? 0,
      gatePolicy: originalEntry?.gatePolicy ?? 'unknown',
      gateVersion: originalEntry?.gateVersion ?? 'unknown',
      requiresReview: false,
      reason: `Manual ${reviewAction.decision} by ${reviewAction.reviewer}`,
      reviewer: reviewAction.reviewer,
      reviewNotes: reviewAction.notes,
      metadata: {
        contentLength: originalEntry?.metadata.contentLength ?? 0,
        sourceOrigin: originalEntry?.metadata.sourceOrigin ?? 'unknown',
        sourceOriginId: originalEntry?.metadata.sourceOriginId,
        processedAt: reviewAction.timestamp,
      },
    };

    this.entries.push(entry);
    this.enforceRetentionLimit();

    return entry;
  }

  /**
   * Record an expiration event in the audit ledger.
   *
   * @param contentId - Content that expired
   * @param originalDecision - The original gate decision
   * @returns The created audit entry
   */
  async recordExpiration(
    contentId: string,
    originalDecision: GateDecision,
  ): Promise<AuditEntry> {
    this.ensureInitialized();

    const originalEntry = this.findLatestGateDecision(contentId);

    const entry: AuditEntry = {
      id: generateAuditId(),
      type: 'expiration',
      timestamp: Date.now(),
      contentId,
      action: 'expire',
      trustTier: originalEntry?.trustTier ?? 'unknown',
      scanVerdict: originalEntry?.scanVerdict ?? 'unknown',
      scanScore: originalEntry?.scanScore ?? 0,
      confidenceCap: 0,
      gatePolicy: originalEntry?.gatePolicy ?? 'unknown',
      gateVersion: originalEntry?.gateVersion ?? 'unknown',
      requiresReview: false,
      reason: `Content expired after quarantine period (${Math.round(originalDecision.confidenceCap * 100)}% confidence cap)`,
      metadata: {
        contentLength: originalEntry?.metadata.contentLength ?? 0,
        sourceOrigin: originalEntry?.metadata.sourceOrigin ?? 'unknown',
        sourceOriginId: originalEntry?.metadata.sourceOriginId,
        processedAt: Date.now(),
      },
    };

    this.entries.push(entry);
    this.enforceRetentionLimit();

    return entry;
  }

  /**
   * Record a system event in the audit ledger.
   *
   * @param event - System event description
   * @param details - Additional details
   * @returns The created audit entry
   */
  async recordSystemEvent(
    event: string,
    details?: Record<string, unknown>,
  ): Promise<AuditEntry> {
    this.ensureInitialized();

    const entry: AuditEntry = {
      id: generateAuditId(),
      type: 'system_event',
      timestamp: Date.now(),
      contentId: 'system',
      action: 'system_init',
      trustTier: 'system',
      scanVerdict: 'clean',
      scanScore: 0,
      confidenceCap: 0,
      gatePolicy: 'system',
      gateVersion: '1.0.0',
      requiresReview: false,
      reason: event,
      metadata: {
        contentLength: 0,
        sourceOrigin: 'system',
        processedAt: Date.now(),
        ...details,
      },
    };

    this.entries.push(entry);
    this.enforceRetentionLimit();

    return entry;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Query audit entries with filters.
   *
   * @param query - Query filters
   * @returns Filtered audit entries (newest first)
   */
  async query(query: AuditQuery = {}): Promise<AuditEntry[]> {
    this.ensureInitialized();

    let results = [...this.entries];

    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }

    if (query.action) {
      results = results.filter((e) => e.action === query.action);
    }

    if (query.trustTier) {
      results = results.filter((e) => e.trustTier === query.trustTier);
    }

    if (query.scanVerdict) {
      results = results.filter((e) => e.scanVerdict === query.scanVerdict);
    }

    if (query.contentId) {
      results = results.filter((e) => e.contentId === query.contentId);
    }

    if (query.before) {
      results = results.filter((e) => e.timestamp < query.before!);
    }

    if (query.after) {
      results = results.filter((e) => e.timestamp > query.after!);
    }

    if (query.requiresReview !== undefined) {
      results = results.filter((e) => e.requiresReview === query.requiresReview);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply offset and limit
    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get all audit entries for a specific content ID.
   *
   * @param contentId - Content ID to look up
   * @returns All audit entries for this content (newest first)
   */
  async getContentHistory(contentId: string): Promise<AuditEntry[]> {
    return this.query({ contentId });
  }

  /**
   * Get audit entries requiring manual review.
   *
   * @returns Entries where requiresReview is true
   */
  async getPendingReview(): Promise<AuditEntry[]> {
    return this.query({ requiresReview: true });
  }

  /**
   * Get the latest audit entry.
   *
   * @returns Most recent audit entry or undefined
   */
  async getLatest(): Promise<AuditEntry | undefined> {
    const results = await this.query({ limit: 1 });
    return results[0];
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get audit ledger statistics.
   *
   * @returns Statistics about audit entries
   */
  async getStats(): Promise<AuditStats> {
    this.ensureInitialized();

    const stats: AuditStats = {
      totalEntries: this.entries.length,
      byType: { gate_decision: 0, review_action: 0, expiration: 0, system_event: 0 },
      byAction: {},
      byTrustTier: {},
      byScanVerdict: {},
      requiringReview: 0,
      reviewed: 0,
      dateRange: {
        earliest: Number.MAX_SAFE_INTEGER,
        latest: 0,
      },
    };

    for (const entry of this.entries) {
      // Count by type
      stats.byType[entry.type]++;

      // Count by action
      stats.byAction[entry.action] = (stats.byAction[entry.action] ?? 0) + 1;

      // Count by trust tier
      stats.byTrustTier[entry.trustTier] = (stats.byTrustTier[entry.trustTier] ?? 0) + 1;

      // Count by scan verdict
      stats.byScanVerdict[entry.scanVerdict] = (stats.byScanVerdict[entry.scanVerdict] ?? 0) + 1;

      // Count requiring review
      if (entry.requiresReview) {
        stats.requiringReview++;
      }

      // Count reviewed (has reviewer)
      if (entry.reviewer) {
        stats.reviewed++;
      }

      // Date range
      if (entry.timestamp < stats.dateRange.earliest) {
        stats.dateRange.earliest = entry.timestamp;
      }
      if (entry.timestamp > stats.dateRange.latest) {
        stats.dateRange.latest = entry.timestamp;
      }
    }

    // Handle empty ledger
    if (stats.dateRange.earliest === Number.MAX_SAFE_INTEGER) {
      stats.dateRange.earliest = 0;
    }

    return stats;
  }

  /**
   * Get decision distribution by action type.
   *
   * @returns Count of each action type
   */
  async getDecisionDistribution(): Promise<Record<string, number>> {
    const stats = await this.getStats();
    return stats.byAction;
  }

  // ============================================================================
  // Export / Reporting
  // ============================================================================

  /**
   * Export audit entries to JSON format.
   *
   * @param query - Query to filter entries
   * @returns JSON string of filtered entries
   */
  async exportToJson(query: AuditQuery = {}): Promise<string> {
    const entries = await this.query(query);
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Export audit entries to JSONL format.
   *
   * @param query - Optional query filters
   * @returns JSONL string (one JSON object per line)
   */
  async exportToJSONL(query: AuditQuery = {}): Promise<string> {
    const entries = await this.query(query);
    
    return entries
      .map((entry) => JSON.stringify({
        id: entry.id,
        type: entry.type,
        timestamp: entry.timestamp,
        isoDate: new Date(entry.timestamp).toISOString(),
        contentId: entry.contentId,
        action: entry.action,
        trustTier: entry.trustTier,
        scanVerdict: entry.scanVerdict,
        scanScore: entry.scanScore,
        confidenceCap: entry.confidenceCap,
        gatePolicy: entry.gatePolicy,
        requiresReview: entry.requiresReview,
        reason: entry.reason,
        reviewer: entry.reviewer,
        reviewNotes: entry.reviewNotes,
        metadata: entry.metadata,
      }))
      .join('\n');
  }

  /**
   * Generate a summary report of gate decisions.
   *
   * @returns Human-readable report
   */
  async generateReport(): Promise<string> {
    const stats = await this.getStats();

    const lines = [
      '=== Quarantine Audit Ledger Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Summary:',
      `  Total Entries: ${stats.totalEntries}`,
      `  Date Range: ${new Date(stats.dateRange.earliest).toISOString()} to ${new Date(stats.dateRange.latest).toISOString()}`,
      '',
      'By Type:',
      ...Object.entries(stats.byType).map(([type, count]) => `  ${type}: ${count}`),
      '',
      'By Action:',
      ...Object.entries(stats.byAction).map(([action, count]) => `  ${action}: ${count}`),
      '',
      'By Trust Tier:',
      ...Object.entries(stats.byTrustTier).map(([tier, count]) => `  ${tier}: ${count}`),
      '',
      'By Scan Verdict:',
      ...Object.entries(stats.byScanVerdict).map(([verdict, count]) => `  ${verdict}: ${count}`),
      '',
      'Review Status:',
      `  Requiring Review: ${stats.requiringReview}`,
      `  Reviewed: ${stats.reviewed}`,
      '=== End Report ===',
    ];

    return lines.join('\n');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AuditLedger not initialized. Call initialize() first.');
    }
  }

  private findLatestGateDecision(contentId: string): AuditEntry | undefined {
    return this.entries
      .filter((e) => e.contentId === contentId && e.type === 'gate_decision')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  private enforceRetentionLimit(): void {
    if (this.entries.length > this.maxEntries) {
      // Remove oldest entries
      this.entries.sort((a, b) => a.timestamp - b.timestamp);
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLedger: AuditLedger | undefined;

export function getAuditLedger(): AuditLedger {
  if (!globalLedger) {
    globalLedger = new AuditLedger();
  }
  return globalLedger;
}

export function resetAuditLedger(): void {
  globalLedger = undefined;
}

// ============================================================================
// Convenience Functions
// ============================================================================

function generateAuditId(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convenience function to record a gate decision and store the item if needed.
 *
 * @param contentId - Unique identifier
 * @param content - Content that was processed
 * @param sourceMetadata - Trust metadata
 * @param scanResult - Scan result
 * @param gateDecision - Gate decision
 * @returns The audit entry
 */
export async function auditGateDecision(
  contentId: string,
  content: string,
  sourceMetadata: SourceTrustMetadata,
  scanResult: ScanResult,
  gateDecision: GateDecision,
): Promise<AuditEntry> {
  const ledger = getAuditLedger();
  return ledger.recordGateDecision(contentId, content, sourceMetadata, scanResult, gateDecision);
}

/**
 * Convenience function to record a review action.
 *
 * @param contentId - Content being reviewed
 * @param reviewer - Who performed the review
 * @param decision - 'approve' or 'reject'
 * @param notes - Optional review notes
 * @returns The audit entry
 */
export async function auditReviewAction(
  contentId: string,
  reviewer: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<AuditEntry> {
  const ledger = getAuditLedger();
  return ledger.recordReviewAction({
    contentId,
    reviewer,
    decision,
    notes,
    timestamp: Date.now(),
  });
}
