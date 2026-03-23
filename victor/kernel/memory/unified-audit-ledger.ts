/**
 * Unified Audit Ledger
 *
 * Bridges quarantine audit ledger (content governance) and governance decision records
 * (action governance) into a single unified audit trail with consistent query interface.
 *
 * This unifies:
 * - quarantine-audit.ts: AuditLedger (content gate decisions)
 * - governance-decision-engine.ts: DecisionRecord (content + action decisions)
 *
 * @module unified-audit-ledger
 */

import type { AuditEntry, AuditQuery, AuditStats } from './quarantine-audit.js';
import type { DecisionRecord, DecisionQuery, DecisionStats, DecisionType, GovernanceVerdict } from './governance-decision-engine.js';

// ============================================================================
// Unified Audit Types
// ============================================================================

/**
 * Unified event types covering both content and action governance.
 */
export type UnifiedEventType =
  | 'content_admission'      // Content passed gate evaluation
  | 'action_execution'       // Action was evaluated
  | 'policy_override'        // Decision was manually overridden
  | 'gate_decision'          // Legacy: quarantine gate decision
  | 'review_action'          // Manual review of content
  | 'expiration'             // Content expired from quarantine
  | 'system_event';          // System-level event

/**
 * Unified actor types for provenance tracking.
 */
export type UnifiedActorType = 'system' | 'user' | 'agent' | 'gate' | 'reviewer';

/**
 * Unified audit entry that normalizes both content and action events.
 */
export interface UnifiedAuditEntry {
  /** Unique entry identifier */
  id: string;

  /** Event type */
  type: UnifiedEventType;

  /** Timestamp (epoch ms) */
  timestamp: number;

  /** ISO date string for readability */
  isoDate: string;

  /** Subject ID (contentId for content, actionId for actions) */
  subjectId: string;

  /** Actor who triggered the event */
  actor: {
    id: string;
    type: UnifiedActorType;
  };

  /** Verdict/outcome */
  verdict: GovernanceVerdict | 'admit' | 'sanitize_admit' | 'quarantine' | 'reject' | 'approve' | 'expire' | 'system_init';

  /** Confidence in the decision (0-1) */
  confidence: number;

  /** Human-readable reasoning */
  reasoning: string;

  /** Policy applied */
  policy: {
    name: string;
    version: string;
  };

  /** Contextual metadata */
  context: {
    projectId?: string;
    phaseId?: string;
    taskId?: string;
    sessionId?: string;
    sourceOrigin?: string;
    sourceTrustTier?: string;
  };

  /** For content events: scan results */
  scan?: {
    verdict: string;
    score: number;
    categories: string[];
  };

  /** For action events: risk level */
  riskLevel?: 'low' | 'medium' | 'high';

  /** Whether this entry requires human review */
  requiresReview: boolean;

  /** Reviewer info if manually reviewed */
  review?: {
    reviewer: string;
    decision: 'approve' | 'reject';
    notes?: string;
    timestamp: number;
  };

  /** Provenance: IDs of related entries */
  provenance: {
    /** ID of decision this entry overrides (if applicable) */
    overrides?: string;

    /** IDs of entries this entry references */
    references?: string[];
  };

  /** Raw source data (for debugging/extensibility) */
  _source: {
    type: 'quarantine_audit' | 'governance_decision';
    entryId: string;
  };
}

/**
 * Unified query interface supporting both content and action filters.
 */
export interface UnifiedAuditQuery {
  /** Filter by event type */
  type?: UnifiedEventType;

  /** Filter by subject ID */
  subjectId?: string;

  /** Filter by actor ID */
  actorId?: string;

  /** Filter by actor type */
  actorType?: UnifiedActorType;

  /** Filter by verdict */
  verdict?: string;

  /** Filter by project */
  projectId?: string;

  /** Filter by trust tier */
  trustTier?: string;

  /** Filter by risk level (for actions) */
  riskLevel?: 'low' | 'medium' | 'high';

  /** Start timestamp (epoch ms) */
  after?: number;

  /** End timestamp (epoch ms) */
  before?: number;

  /** Only entries requiring review */
  requiresReview?: boolean;

  /** Only reviewed entries */
  hasReview?: boolean;

  /** Maximum results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Unified statistics spanning content and action events.
 */
export interface UnifiedAuditStats {
  /** Total entries */
  total: number;

  /** Entries by type */
  byType: Record<UnifiedEventType, number>;

  /** Entries by verdict */
  byVerdict: Record<string, number>;

  /** Entries by actor type */
  byActorType: Record<UnifiedActorType, number>;

  /** Content events: by trust tier */
  byTrustTier: Record<string, number>;

  /** Action events: by risk level */
  byRiskLevel: Record<string, number>;

  /** Entries requiring review */
  requiringReview: number;

  /** Entries that have been reviewed */
  reviewed: number;

  /** Date range */
  dateRange: {
    earliest: number;
    latest: number;
  };

  /** Average confidence across all entries */
  averageConfidence: number;
}

// ============================================================================
// Unified Audit Ledger
// ============================================================================

/**
 * Unified audit ledger that aggregates events from both content governance
 * (quarantine-audit.ts) and action governance (governance-decision-engine.ts).
 */
export class UnifiedAuditLedger {
  private entries: UnifiedAuditEntry[] = [];
  private initialized = false;
  private maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
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

  // --------------------------------------------------------------------------
  // Entry Ingestion
  // --------------------------------------------------------------------------

  /**
   * Ingest a quarantine audit entry into the unified ledger.
   *
   * @param entry - AuditEntry from quarantine-audit.ts
   * @returns Unified entry
   */
  ingestQuarantineEntry(entry: AuditEntry): UnifiedAuditEntry {
    this.ensureInitialized();

    const unified: UnifiedAuditEntry = {
      id: `uni_${entry.id}`,
      type: this.mapQuarantineType(entry.type),
      timestamp: entry.timestamp,
      isoDate: new Date(entry.timestamp).toISOString(),
      subjectId: entry.contentId,
      actor: {
        id: entry.reviewer || 'gate',
        type: entry.reviewer ? 'reviewer' : 'gate',
      },
      verdict: entry.action,
      confidence: entry.confidenceCap,
      reasoning: entry.reason,
      policy: {
        name: entry.gatePolicy,
        version: entry.gateVersion,
      },
      context: {
        sourceOrigin: entry.metadata.sourceOrigin,
        sourceTrustTier: entry.trustTier,
      },
      scan: {
        verdict: entry.scanVerdict,
        score: entry.scanScore,
        categories: [], // Could be populated from related scan results
      },
      requiresReview: entry.requiresReview,
      review: entry.reviewer ? {
        reviewer: entry.reviewer,
        decision: entry.action === 'approve' ? 'approve' : 'reject',
        notes: entry.reviewNotes,
        timestamp: entry.timestamp,
      } : undefined,
      provenance: {
        references: [],
      },
      _source: {
        type: 'quarantine_audit',
        entryId: entry.id,
      },
    };

    this.addEntry(unified);
    return unified;
  }

  /**
   * Ingest a governance decision record into the unified ledger.
   *
   * @param record - DecisionRecord from governance-decision-engine.ts
   * @returns Unified entry
   */
  ingestGovernanceDecision(record: DecisionRecord): UnifiedAuditEntry {
    this.ensureInitialized();

    const unified: UnifiedAuditEntry = {
      id: `uni_${record.id}`,
      type: this.mapDecisionType(record.type),
      timestamp: new Date(record.createdAt).getTime(),
      isoDate: record.createdAt,
      subjectId: this.extractSubjectId(record),
      actor: {
        id: record.context.actor,
        type: this.inferActorType(record.context.actor),
      },
      verdict: record.decision.verdict,
      confidence: record.decision.confidence,
      reasoning: record.decision.reasoning,
      policy: {
        name: record.decision.policyName,
        version: record.decision.policyVersion,
      },
      context: {
        projectId: record.context.projectId,
        phaseId: record.context.phaseId,
        taskId: record.context.taskId,
        sessionId: record.context.sessionId,
      },
      requiresReview: record.decision.verdict === 'quarantine' || record.decision.verdict === 'reject',
      provenance: {
        overrides: record.overriddenBy,
        references: [],
      },
      _source: {
        type: 'governance_decision',
        entryId: record.id,
      },
    };

    // Add risk level for action execution
    if (record.type === 'action_execution') {
      const req = record.request as { riskLevel?: 'low' | 'medium' | 'high' };
      unified.riskLevel = req.riskLevel;
    }

    this.addEntry(unified);
    return unified;
  }

  /**
   * Add a custom unified entry directly.
   *
   * @param entry - Unified audit entry
   */
  addEntry(entry: UnifiedAuditEntry): void {
    this.entries.push(entry);
    this.enforceRetentionLimit();
  }

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  /**
   * Query unified audit entries with filters.
   *
   * @param query - Query filters
   * @returns Filtered entries (newest first)
   */
  async query(query: UnifiedAuditQuery = {}): Promise<UnifiedAuditEntry[]> {
    this.ensureInitialized();

    let results = [...this.entries];

    // Apply filters
    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }

    if (query.subjectId) {
      results = results.filter((e) => e.subjectId === query.subjectId);
    }

    if (query.actorId) {
      results = results.filter((e) => e.actor.id === query.actorId);
    }

    if (query.actorType) {
      results = results.filter((e) => e.actor.type === query.actorType);
    }

    if (query.verdict) {
      results = results.filter((e) => e.verdict === query.verdict);
    }

    if (query.projectId) {
      results = results.filter((e) => e.context.projectId === query.projectId);
    }

    if (query.trustTier) {
      results = results.filter((e) => e.context.sourceTrustTier === query.trustTier);
    }

    if (query.riskLevel) {
      results = results.filter((e) => e.riskLevel === query.riskLevel);
    }

    if (query.after) {
      results = results.filter((e) => e.timestamp >= query.after!);
    }

    if (query.before) {
      results = results.filter((e) => e.timestamp <= query.before!);
    }

    if (query.requiresReview !== undefined) {
      results = results.filter((e) => e.requiresReview === query.requiresReview);
    }

    if (query.hasReview !== undefined) {
      results = results.filter((e) => (e.review !== undefined) === query.hasReview);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get all entries for a specific subject.
   *
   * @param subjectId - Subject ID (content or action)
   * @returns All related entries
   */
  async getSubjectHistory(subjectId: string): Promise<UnifiedAuditEntry[]> {
    return this.query({ subjectId });
  }

  /**
   * Get entries for a specific project.
   *
   * @param projectId - Project identifier
   * @param limit - Maximum results
   * @returns Project-related entries
   */
  async getProjectEntries(projectId: string, limit = 100): Promise<UnifiedAuditEntry[]> {
    return this.query({ projectId, limit });
  }

  /**
   * Get entries requiring review.
   *
   * @returns Entries where requiresReview is true
   */
  async getPendingReview(): Promise<UnifiedAuditEntry[]> {
    return this.query({ requiresReview: true });
  }

  /**
   * Get recent entries.
   *
   * @param limit - Maximum results
   * @returns Recent entries
   */
  async getRecent(limit = 50): Promise<UnifiedAuditEntry[]> {
    return this.query({ limit });
  }

  /**
   * Get the latest entry.
   *
   * @returns Most recent entry or undefined
   */
  async getLatest(): Promise<UnifiedAuditEntry | undefined> {
    const results = await this.query({ limit: 1 });
    return results[0];
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  /**
   * Get unified audit statistics.
   *
   * @returns Statistics spanning content and action events
   */
  async getStats(): Promise<UnifiedAuditStats> {
    this.ensureInitialized();

    const stats: UnifiedAuditStats = {
      total: this.entries.length,
      byType: {
        content_admission: 0,
        action_execution: 0,
        policy_override: 0,
        gate_decision: 0,
        review_action: 0,
        expiration: 0,
        system_event: 0,
      },
      byVerdict: {},
      byActorType: {
        system: 0,
        user: 0,
        agent: 0,
        gate: 0,
        reviewer: 0,
      },
      byTrustTier: {},
      byRiskLevel: {},
      requiringReview: 0,
      reviewed: 0,
      dateRange: {
        earliest: Number.MAX_SAFE_INTEGER,
        latest: 0,
      },
      averageConfidence: 0,
    };

    let totalConfidence = 0;

    for (const entry of this.entries) {
      // Count by type
      stats.byType[entry.type]++;

      // Count by verdict
      stats.byVerdict[entry.verdict] = (stats.byVerdict[entry.verdict] ?? 0) + 1;

      // Count by actor type
      stats.byActorType[entry.actor.type]++;

      // Count by trust tier
      if (entry.context.sourceTrustTier) {
        stats.byTrustTier[entry.context.sourceTrustTier] =
          (stats.byTrustTier[entry.context.sourceTrustTier] ?? 0) + 1;
      }

      // Count by risk level
      if (entry.riskLevel) {
        stats.byRiskLevel[entry.riskLevel] = (stats.byRiskLevel[entry.riskLevel] ?? 0) + 1;
      }

      // Count requiring review
      if (entry.requiresReview) {
        stats.requiringReview++;
      }

      // Count reviewed
      if (entry.review) {
        stats.reviewed++;
      }

      // Date range
      if (entry.timestamp < stats.dateRange.earliest) {
        stats.dateRange.earliest = entry.timestamp;
      }
      if (entry.timestamp > stats.dateRange.latest) {
        stats.dateRange.latest = entry.timestamp;
      }

      // Confidence sum
      totalConfidence += entry.confidence;
    }

    // Calculate average
    stats.averageConfidence = this.entries.length > 0 ? totalConfidence / this.entries.length : 0;

    // Handle empty ledger
    if (stats.dateRange.earliest === Number.MAX_SAFE_INTEGER) {
      stats.dateRange.earliest = 0;
    }

    return stats;
  }

  // --------------------------------------------------------------------------
  // Export / Reporting
  // --------------------------------------------------------------------------

  /**
   * Export entries to JSONL format.
   *
   * @param query - Optional query filters
   * @returns JSONL string
   */
  async exportToJSONL(query?: UnifiedAuditQuery): Promise<string> {
    const entries = query ? await this.query(query) : [...this.entries];
    return entries.map((e) => JSON.stringify(e)).join('\n');
  }

  /**
   * Export entries to formatted JSON.
   *
   * @param query - Optional query filters
   * @returns JSON string
   */
  async exportToJson(query?: UnifiedAuditQuery): Promise<string> {
    const entries = query ? await this.query(query) : [...this.entries];
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Generate a human-readable report.
   *
   * @returns Report string
   */
  async generateReport(): Promise<string> {
    const stats = await this.getStats();

    const lines = [
      '=== Unified Audit Ledger Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Summary:',
      `  Total Entries: ${stats.total}`,
      `  Date Range: ${new Date(stats.dateRange.earliest).toISOString()} to ${new Date(stats.dateRange.latest).toISOString()}`,
      `  Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`,
      '',
      'By Type:',
      ...Object.entries(stats.byType).map(([type, count]) => `  ${type}: ${count}`),
      '',
      'By Verdict:',
      ...Object.entries(stats.byVerdict).map(([verdict, count]) => `  ${verdict}: ${count}`),
      '',
      'By Actor Type:',
      ...Object.entries(stats.byActorType).map(([type, count]) => `  ${type}: ${count}`),
      '',
      'Content Events (by Trust Tier):',
      ...Object.entries(stats.byTrustTier).map(([tier, count]) => `  ${tier}: ${count}`),
      '',
      'Action Events (by Risk Level):',
      ...Object.entries(stats.byRiskLevel).map(([level, count]) => `  ${level}: ${count}`),
      '',
      'Review Status:',
      `  Requiring Review: ${stats.requiringReview}`,
      `  Reviewed: ${stats.reviewed}`,
      '=== End Report ===',
    ];

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('UnifiedAuditLedger not initialized. Call initialize() first.');
    }
  }

  private mapQuarantineType(type: string): UnifiedEventType {
    switch (type) {
      case 'gate_decision':
        return 'gate_decision';
      case 'review_action':
        return 'review_action';
      case 'expiration':
        return 'expiration';
      case 'system_event':
        return 'system_event';
      default:
        return 'system_event';
    }
  }

  private mapDecisionType(type: DecisionType): UnifiedEventType {
    switch (type) {
      case 'content_admission':
        return 'content_admission';
      case 'action_execution':
        return 'action_execution';
      case 'policy_override':
        return 'policy_override';
      default:
        return 'system_event';
    }
  }

  private extractSubjectId(record: DecisionRecord): string {
    if (record.type === 'content_admission') {
      const req = record.request as { origin?: string };
      return req.origin || 'unknown';
    }
    if (record.type === 'action_execution') {
      const req = record.request as { actionId?: string };
      return req.actionId || 'unknown';
    }
    return record.id;
  }

  private inferActorType(actorId: string): UnifiedActorType {
    if (actorId.includes('agent') || actorId.includes('victor')) {
      return 'agent';
    }
    if (actorId === 'system' || actorId === 'gate') {
      return 'system';
    }
    if (actorId.includes('reviewer') || actorId.includes('user')) {
      return 'user';
    }
    return 'agent';
  }

  private enforceRetentionLimit(): void {
    if (this.entries.length > this.maxEntries) {
      // Sort by timestamp ascending and remove oldest
      this.entries.sort((a, b) => a.timestamp - b.timestamp);
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLedger: UnifiedAuditLedger | undefined;

/**
 * Get the global unified audit ledger instance.
 */
export function getUnifiedAuditLedger(): UnifiedAuditLedger {
  if (!globalLedger) {
    globalLedger = new UnifiedAuditLedger();
  }
  return globalLedger;
}

/**
 * Set the global unified audit ledger instance.
 */
export function setUnifiedAuditLedger(ledger: UnifiedAuditLedger): void {
  globalLedger = ledger;
}

/**
 * Reset the global unified audit ledger.
 */
export function resetUnifiedAuditLedger(): void {
  globalLedger = undefined;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick query for recent entries.
 */
export async function getRecentAuditEntries(limit = 50): Promise<UnifiedAuditEntry[]> {
  const ledger = getUnifiedAuditLedger();
  return ledger.getRecent(limit);
}

/**
 * Quick query for pending reviews.
 */
export async function getPendingReviews(): Promise<UnifiedAuditEntry[]> {
  const ledger = getUnifiedAuditLedger();
  return ledger.getPendingReview();
}

/**
 * Quick stats retrieval.
 */
export async function getQuickStats(): Promise<UnifiedAuditStats> {
  const ledger = getUnifiedAuditLedger();
  return ledger.getStats();
}
