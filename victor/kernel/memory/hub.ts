/**
 * Hub Types — Central payload definitions for Victor state APIs
 *
 * Provides type-safe HubPayload structure for project-state and quarantine APIs.
 * Quarantine data is null-safe and gracefully degrades when the pipeline is disabled.
 */

import type { StoreStats, StoredItem } from './quarantine-store.js';

// ============================================================================
// Quarantine Data Types
// ============================================================================

export type ExplorationStatus = 'idle' | 'active' | 'paused' | 'disabled';

export interface QuarantineVerdictDistribution {
  clean: number;
  suspicious: number;
  hostile: number;
}

export interface QuarantineSummary {
  /** Whether quarantine pipeline is enabled and initialized */
  enabled: boolean;
  /** Total items by status */
  stats: StoreStats;
  /** Scan verdict distribution */
  verdictDistribution: QuarantineVerdictDistribution;
  /** ISO timestamp of last fetch operation */
  lastFetchAt: string | null;
  /** Number of exploration ticks executed */
  explorationTicks: number;
  /** Current exploration status */
  explorationStatus: ExplorationStatus;
  /** Number of items awaiting human review */
  pendingReview: number;
}

export interface QuarantineItemSummary {
  id: string;
  source: string;
  sourceId: string;
  title: string;
  authorName: string;
  authorId: string;
  state: 'quarantined' | 'provisional' | 'rejected' | 'expired' | 'admitted';
  scanVerdict: 'clean' | 'suspicious' | 'hostile';
  scanCategories: string[];
  confidence: number;
  storedAt: string;
  expiresAt: string;
}

export interface QuarantineHubData {
  /** Pipeline active status */
  pipelineActive: boolean;
  /** Summary statistics */
  summary: QuarantineSummary;
  /** Recent items (newest first, limited) */
  recentItems: QuarantineItemSummary[];
  /** Message for disabled state */
  message?: string;
}

// ============================================================================
// Hub Payload Types
// ============================================================================

export interface VictorHubState {
  phase: string;
  phaseName: string;
  phaseStatus: string;
  phaseObjective: string;
  phaseTasks: Array<{
    taskId: string;
    phaseId: string;
    title: string;
    description: string;
    acceptance: string[];
    status: 'pending' | 'in-progress' | 'done' | 'blocked';
  }>;
  heartbeat: {
    mode: string;
    tier: number;
    cadence: number;
    observationWindow: {
      ticksCompleted: number;
      ticksRequired: number;
      percentComplete: number;
    };
    latestTick: string | null;
    totalTicks: number;
  };
  promotion: {
    verdict: string;
    title: string;
    tier1Authorized: boolean;
    tier1Complete: boolean;
    unmetCriteria: string[];
    nextTier: number;
  };
  ledger: {
    totalEntries: number;
    latestEntryId: string | null;
    latestTimestamp: string | null;
  };
}

export interface BuilderHubProgress {
  completed: number;
  total: number;
  percent: number;
  inProgress: number;
  pendingHigh: number;
}

export interface BuilderHubDependency {
  taskId: string;
  title: string;
  blockedBy: string;
  severity: string;
}

export interface BuilderHubState {
  progress: BuilderHubProgress;
  dependencies: BuilderHubDependency[];
}

export interface RecentActivityItem {
  entryId: string;
  type: string;
  timestamp: string;
  scope: string;
  status: string;
  label: string;
  deliverables?: string[];
}

/**
 * HubPayload — Central state payload for Victor and Builder Console
 *
 * Includes null-safe quarantine data that gracefully degrades when the
 * pipeline is disabled or the store is unavailable.
 */
export interface HubPayload {
  victor: VictorHubState;
  builder: BuilderHubState;
  quarantine: QuarantineHubData;
  recentActivity: RecentActivityItem[];
  timestamp: string;
}

// ============================================================================
// Hub Data Builders
// ============================================================================

import { getQuarantineStore } from './quarantine-store.js';

/**
 * Build quarantine summary from store stats.
 */
export async function buildQuarantineSummary(): Promise<QuarantineSummary> {
  const store = getQuarantineStore();

  if (!store.isInitialized()) {
    return {
      enabled: false,
      stats: {
        total: 0,
        quarantined: 0,
        provisional: 0,
        rejected: 0,
        expired: 0,
        admitted: 0,
        pendingReview: 0,
      },
      verdictDistribution: { clean: 0, suspicious: 0, hostile: 0 },
      lastFetchAt: null,
      explorationTicks: 0,
      explorationStatus: 'disabled',
      pendingReview: 0,
    };
  }

  const stats = await store.getStats();

  // Get recent items for verdict distribution
  const recentItems = await store.query({ limit: 100 });
  const verdictDistribution: QuarantineVerdictDistribution = {
    clean: recentItems.filter((i) => i.scanResult.verdict === 'clean').length,
    suspicious: recentItems.filter((i) => i.scanResult.verdict === 'suspicious').length,
    hostile: recentItems.filter((i) => i.scanResult.verdict === 'hostile').length,
  };

  // Find last fetch time from most recent item
  const lastItem = recentItems[0];
  const lastFetchAt = lastItem
    ? new Date(lastItem.storedAt).toISOString()
    : null;

  return {
    enabled: true,
    stats,
    verdictDistribution,
    lastFetchAt,
    explorationTicks: 0, // Will be populated by heartbeat exploration
    explorationStatus: 'idle',
    pendingReview: stats.pendingReview,
  };
}

/**
 * Build recent items summary for HubPayload.
 */
export async function buildRecentItemsSummary(limit = 10): Promise<QuarantineItemSummary[]> {
  const store = getQuarantineStore();

  if (!store.isInitialized()) {
    return [];
  }

  const items = await store.query({ limit });

  return items.map((item) => ({
    id: item.id,
    source: item.sourceMetadata.sourceOrigin,
    sourceId: item.sourceMetadata.sourceOriginId || '',
    title: item.content.slice(0, 100).split('\n')[0] || 'Untitled',
    authorName: item.sourceMetadata.sourceAuthor || 'Unknown',
    authorId: '', // Not currently tracked in SourceTrustMetadata
    state: item.status,
    scanVerdict: item.scanResult.verdict,
    scanCategories: item.scanResult.details
      .filter((d) => d.matched)
      .map((d) => d.category),
    confidence: item.gateDecision.finalConfidence,
    storedAt: new Date(item.storedAt).toISOString(),
    expiresAt: new Date(item.expiresAt).toISOString(),
  }));
}

/**
 * Build complete quarantine hub data.
 */
export async function buildQuarantineHubData(): Promise<QuarantineHubData> {
  const store = getQuarantineStore();
  const pipelineActive = store.isInitialized();

  if (!pipelineActive) {
    return {
      pipelineActive: false,
      summary: {
        enabled: false,
        stats: {
          total: 0,
          quarantined: 0,
          provisional: 0,
          rejected: 0,
          expired: 0,
          admitted: 0,
          pendingReview: 0,
        },
        verdictDistribution: { clean: 0, suspicious: 0, hostile: 0 },
        lastFetchAt: null,
        explorationTicks: 0,
        explorationStatus: 'disabled',
        pendingReview: 0,
      },
      recentItems: [],
      message: 'Quarantine pipeline not yet active. Phase 7 (Moltbook Quarantine Pipeline) is available but not initialized.',
    };
  }

  const [summary, recentItems] = await Promise.all([
    buildQuarantineSummary(),
    buildRecentItemsSummary(10),
  ]);

  return {
    pipelineActive: true,
    summary,
    recentItems,
  };
}
