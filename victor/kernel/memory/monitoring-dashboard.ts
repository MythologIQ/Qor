/**
 * Monitoring Dashboard — Real-time Execute Mode Governance Monitoring
 *
 * Provides real-time visibility into Victor's execute-mode governance state,
 * tier progression, action metrics, and system health. Designed for both
 * programmatic consumption and UI visualization.
 *
 * @module monitoring-dashboard
 */

import type {
  ExecuteGovernanceState,
  ExecuteTier,
  RevocationTriggerType,
  TierTransition,
} from './execute-governance';
import {
  TIER_NAMES,
  TIER_DESCRIPTIONS,
  TIER_CAPABILITIES,
  TIER_AUTHORIZATION,
  REVOCATION_TRIGGER_DESCRIPTIONS,
  evaluatePromotion,
  checkRevocationTriggers,
} from './execute-governance';

// ============================================================================
// Dashboard Types
// ============================================================================

/** Overall system health status */
export type SystemHealth = 'healthy' | 'degraded' | 'critical' | 'paused';

/** Dashboard metrics snapshot */
export interface DashboardMetrics {
  /** Current timestamp */
  timestamp: string;

  /** System health status */
  health: SystemHealth;

  /** Current tier status */
  tier: TierStatus;

  /** Action metrics */
  actions: ActionMetrics;

  /** Progress toward next tier */
  progress: TierProgress;

  /** Active alerts */
  alerts: Alert[];

  /** Recent activity summary */
  activity: ActivitySummary;
}

/** Current tier status */
export interface TierStatus {
  /** Current tier level */
  current: ExecuteTier;

  /** Human-readable tier name */
  name: string;

  /** Tier description */
  description: string;

  /** When current tier was entered */
  enteredAt: string;

  /** Duration at current tier in milliseconds */
  durationMs: number;

  /** Whether tier is paused */
  isPaused: boolean;

  /** Current capabilities at this tier */
  capabilities: {
    canExecuteWrites: boolean;
    canExecuteWithoutApproval: boolean;
    maxActionsPerTick: number;
    canScheduleFuture: boolean;
    canCrossProject: boolean;
  };

  /** Active revocation triggers */
  activeTriggers: ActiveTrigger[];
}

/** Active trigger with details */
export interface ActiveTrigger {
  type: RevocationTriggerType;
  description: string;
  severity: 'warning' | 'critical';
}

/** Action metrics */
export interface ActionMetrics {
  /** Total productive ticks across all tiers */
  totalProductiveTicks: number;

  /** Productive ticks at current tier */
  currentTierTicks: number;

  /** Total successful actions */
  totalSuccessfulActions: number;

  /** Successful actions at current tier */
  currentTierSuccessfulActions: number;

  /** Total failed actions */
  totalFailedActions: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Current consecutive blocked count */
  consecutiveBlocked: number;

  /** Current consecutive failure count */
  consecutiveFailures: number;

  /** Whether blocked threshold is near */
  nearBlockedThreshold: boolean;

  /** Whether failure threshold is near */
  nearFailureThreshold: boolean;
}

/** Progress toward next tier */
export interface TierProgress {
  /** Whether promotion is eligible */
  eligible: boolean;

  /** Target tier for promotion */
  targetTier?: ExecuteTier;

  /** Target tier name */
  targetTierName?: string;

  /** Confidence in promotion (0-1) */
  confidence: number;

  /** Criteria met for promotion */
  metCriteria: string[];

  /** Criteria missing for promotion */
  missingCriteria: string[];

  /** Progress percentage toward next tier (0-100) */
  percentComplete: number;
}

/** Alert severity levels */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/** Alert record */
export interface Alert {
  /** Alert ID */
  id: string;

  /** Timestamp */
  timestamp: string;

  /** Severity level */
  severity: AlertSeverity;

  /** Alert category */
  category: 'tier' | 'action' | 'safety' | 'system';

  /** Alert title */
  title: string;

  /** Alert message */
  message: string;

  /** Whether alert is acknowledged */
  acknowledged: boolean;
}

/** Activity summary */
export interface ActivitySummary {
  /** Recent tier transitions */
  recentTransitions: TierTransition[];

  /** Last update timestamp */
  lastUpdateAt: string;

  /** Time since last productive tick (ms) */
  timeSinceLastProductiveTick: number | null;

  /** Whether system is idle (no recent activity) */
  isIdle: boolean;
}

/** Historical metrics for trending */
export interface HistoricalMetrics {
  /** Timestamp range start */
  startTime: string;

  /** Timestamp range end */
  endTime: string;

  /** Data points */
  dataPoints: HistoricalDataPoint[];
}

/** Single historical data point */
export interface HistoricalDataPoint {
  /** Timestamp */
  timestamp: string;

  /** Tier at this time */
  tier: ExecuteTier;

  /** Productive tick count */
  productiveTicks: number;

  /** Successful actions */
  successfulActions: number;

  /** Failed actions */
  failedActions: number;

  /** Active triggers count */
  activeTriggersCount: number;
}

// ============================================================================
// Dashboard Generation
// ============================================================================

/**
 * Generate a complete dashboard metrics snapshot from current governance state.
 */
export function generateDashboardMetrics(
  state: ExecuteGovernanceState,
  options: {
    /** Time threshold for idle detection (ms, default 5 minutes) */
    idleThresholdMs?: number;
    /** Maximum alerts to include (default 10) */
    maxAlerts?: number;
    /** Historical transitions to include (default 5) */
    maxTransitions?: number;
  } = {},
): DashboardMetrics {
  const {
    idleThresholdMs = 5 * 60 * 1000, // 5 minutes
    maxAlerts = 10,
    maxTransitions = 5,
  } = options;

  const now = new Date();
  const lastUpdate = new Date(state.lastUpdatedAt);
  const tierEntered = new Date(state.tierEnteredAt);

  // Calculate health status
  const health = calculateHealth(state);

  // Build tier status
  const tier: TierStatus = {
    current: state.currentTier,
    name: TIER_NAMES[state.currentTier],
    description: TIER_DESCRIPTIONS[state.currentTier],
    enteredAt: state.tierEnteredAt,
    durationMs: now.getTime() - tierEntered.getTime(),
    isPaused: state.isPaused,
    capabilities: {
      canExecuteWrites: TIER_CAPABILITIES[state.currentTier].canExecuteWrites,
      canExecuteWithoutApproval: TIER_CAPABILITIES[state.currentTier].canExecuteWithoutApproval,
      maxActionsPerTick: TIER_CAPABILITIES[state.currentTier].maxActionsPerTick,
      canScheduleFuture: TIER_CAPABILITIES[state.currentTier].canScheduleFuture,
      canCrossProject: TIER_CAPABILITIES[state.currentTier].canCrossProject,
    },
    activeTriggers: state.activeTriggers.map((trigger) => ({
      type: trigger,
      description: REVOCATION_TRIGGER_DESCRIPTIONS[trigger],
      severity: trigger === 'safety_trigger' || trigger === 'policy_violation' ? 'critical' : 'warning',
    })),
  };

  // Build action metrics
  const totalFailed = state.totalSuccessfulActions > 0
    ? Math.max(0, state.totalProductiveTicks - state.totalSuccessfulActions)
    : 0;
  const successRate = state.totalProductiveTicks > 0
    ? state.totalSuccessfulActions / state.totalProductiveTicks
    : 0;

  const caps = TIER_CAPABILITIES[state.currentTier];
  const nearBlockedThreshold = caps.maxConsecutiveBlocked > 0 &&
    state.consecutiveBlocked >= Math.floor(caps.maxConsecutiveBlocked * 0.8);
  const nearFailureThreshold = caps.maxConsecutiveFailures > 0 &&
    state.consecutiveFailures >= Math.floor(caps.maxConsecutiveFailures * 0.8);

  const actions: ActionMetrics = {
    totalProductiveTicks: state.totalProductiveTicks,
    currentTierTicks: state.currentTierTicks,
    totalSuccessfulActions: state.totalSuccessfulActions,
    currentTierSuccessfulActions: state.currentTierSuccessfulActions,
    totalFailedActions: totalFailed,
    successRate,
    consecutiveBlocked: state.consecutiveBlocked,
    consecutiveFailures: state.consecutiveFailures,
    nearBlockedThreshold,
    nearFailureThreshold,
  };

  // Build progress toward next tier
  const promotionEval = evaluatePromotion(state);
  const revocationCheck = checkRevocationTriggers(state);

  // Calculate percent complete based on the limiting factor
  let targetTier: ExecuteTier | undefined;
  let targetTierName: string | undefined;
  let percentComplete = 0;

  if (state.currentTier >= 3) {
    // At max tier - 100% complete, no next tier
    percentComplete = 100;
    targetTier = undefined;
    targetTierName = undefined;
  } else if (promotionEval.targetTier && promotionEval.targetTier > state.currentTier) {
    // Valid promotion target
    targetTier = promotionEval.targetTier;
    targetTierName = TIER_NAMES[targetTier];
    const auth = TIER_AUTHORIZATION[targetTier];
    const tickProgress = Math.min(100, (state.currentTierTicks / auth.minObservationTicks) * 100);
    const actionProgress = Math.min(100, (state.currentTierSuccessfulActions / auth.minSuccessfulActions) * 100);
    percentComplete = Math.min(tickProgress, actionProgress);
  }

  const progress: TierProgress = {
    eligible: promotionEval.eligible && state.currentTier < 3,
    targetTier,
    targetTierName,
    confidence: promotionEval.confidence,
    metCriteria: promotionEval.metCriteria,
    missingCriteria: state.currentTier >= 3 ? [] : promotionEval.missingCriteria,
    percentComplete,
  };

  // Generate alerts
  const alerts = generateAlerts(state, health, nearBlockedThreshold, nearFailureThreshold, revocationCheck)
    .slice(0, maxAlerts);

  // Build activity summary
  const timeSinceLastUpdate = now.getTime() - lastUpdate.getTime();
  const activity: ActivitySummary = {
    recentTransitions: state.tierHistory.slice(-maxTransitions),
    lastUpdateAt: state.lastUpdatedAt,
    timeSinceLastProductiveTick: state.totalProductiveTicks > 0 ? timeSinceLastUpdate : null,
    isIdle: timeSinceLastUpdate > idleThresholdMs,
  };

  return {
    timestamp: now.toISOString(),
    health,
    tier,
    actions,
    progress,
    alerts,
    activity,
  };
}

/**
 * Calculate overall system health from governance state.
 */
function calculateHealth(state: ExecuteGovernanceState): SystemHealth {
  if (state.isPaused) {
    return 'paused';
  }

  // Check for critical triggers that cause immediate halt
  const criticalTriggers: RevocationTriggerType[] = ['policy_violation', 'safety_trigger'];
  if (state.activeTriggers.some((t) => criticalTriggers.includes(t))) {
    return 'critical';
  }

  const revocationCheck = checkRevocationTriggers(state);
  if (revocationCheck.shouldRevoke && revocationCheck.immediateHalt) {
    return 'critical';
  }

  if (state.activeTriggers.length > 0 || revocationCheck.shouldRevoke) {
    return 'degraded';
  }

  const caps = TIER_CAPABILITIES[state.currentTier];
  if (state.consecutiveBlocked >= caps.maxConsecutiveBlocked * 0.8 ||
      state.consecutiveFailures >= caps.maxConsecutiveFailures * 0.8) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Generate alerts from current state.
 */
function generateAlerts(
  state: ExecuteGovernanceState,
  health: SystemHealth,
  nearBlockedThreshold: boolean,
  nearFailureThreshold: boolean,
  revocationCheck: { shouldRevoke: boolean; firedTriggers: { trigger: RevocationTriggerType; immediateHalt: boolean }[] },
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();
  let alertId = 0;

  // Critical revocation alerts
  if (revocationCheck.shouldRevoke) {
    for (const fired of revocationCheck.firedTriggers) {
      alerts.push({
        id: `revocation-${alertId++}`,
        timestamp: now,
        severity: fired.immediateHalt ? 'critical' : 'warning',
        category: 'tier',
        title: `Revocation Trigger: ${REVOCATION_TRIGGER_DESCRIPTIONS[fired.trigger]}`,
        message: fired.immediateHalt
          ? 'Immediate halt required. Autonomy has been revoked.'
          : 'Autonomy revocation triggered. Review and reauthorize to continue.',
        acknowledged: false,
      });
    }
  }

  // Promotion eligible alert
  if (state.currentTier < 3) {
    const promotionEval = evaluatePromotion(state);
    if (promotionEval.eligible) {
      alerts.push({
        id: `promotion-${alertId++}`,
        timestamp: now,
        severity: 'info',
        category: 'tier',
        title: `Promotion to ${TIER_NAMES[(state.currentTier + 1) as ExecuteTier]} Available`,
        message: 'All criteria met for tier promotion. Awaiting user confirmation.',
        acknowledged: false,
      });
    }
  }

  // Near-threshold warnings
  if (nearBlockedThreshold) {
    alerts.push({
      id: `threshold-${alertId++}`,
      timestamp: now,
      severity: 'warning',
      category: 'action',
      title: 'Consecutive Blocked Ticks Near Threshold',
      message: `${state.consecutiveBlocked} consecutive blocked ticks. Approaching tier revocation threshold.`,
      acknowledged: false,
    });
  }

  if (nearFailureThreshold) {
    alerts.push({
      id: `threshold-${alertId++}`,
      timestamp: now,
      severity: 'warning',
      category: 'action',
      title: 'Consecutive Failures Near Threshold',
      message: `${state.consecutiveFailures} consecutive failures. Approaching tier revocation threshold.`,
      acknowledged: false,
    });
  }

  // Active trigger alerts
  for (const trigger of state.activeTriggers) {
    if (!revocationCheck.firedTriggers.some((f) => f.trigger === trigger)) {
      alerts.push({
        id: `trigger-${alertId++}`,
        timestamp: now,
        severity: 'warning',
        category: 'safety',
        title: `Active Trigger: ${REVOCATION_TRIGGER_DESCRIPTIONS[trigger]}`,
        message: 'This trigger is active and may affect promotion eligibility.',
        acknowledged: false,
      });
    }
  }

  // Paused alert
  if (state.isPaused) {
    alerts.push({
      id: `system-${alertId++}`,
      timestamp: now,
      severity: 'info',
      category: 'system',
      title: 'System Paused',
      message: 'Execute mode is currently paused. Resume to continue operation.',
      acknowledged: false,
    });
  }

  return alerts;
}

// ============================================================================
// Historical Tracking
// ============================================================================

/**
 * Create a historical data point from current state.
 */
export function createHistoricalDataPoint(state: ExecuteGovernanceState): HistoricalDataPoint {
  const totalFailed = Math.max(0, state.totalProductiveTicks - state.totalSuccessfulActions);

  return {
    timestamp: new Date().toISOString(),
    tier: state.currentTier,
    productiveTicks: state.totalProductiveTicks,
    successfulActions: state.totalSuccessfulActions,
    failedActions: totalFailed,
    activeTriggersCount: state.activeTriggers.length,
  };
}

/**
 * Build historical metrics from a series of data points.
 */
export function buildHistoricalMetrics(
  dataPoints: HistoricalDataPoint[],
): HistoricalMetrics | null {
  if (dataPoints.length === 0) {
    return null;
  }

  const sorted = [...dataPoints].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return {
    startTime: sorted[0].timestamp,
    endTime: sorted[sorted.length - 1].timestamp,
    dataPoints: sorted,
  };
}

// ============================================================================
// Status Summaries
// ============================================================================

/**
 * Generate a human-readable status summary.
 */
export function generateStatusSummary(metrics: DashboardMetrics): string {
  const lines: string[] = [];

  lines.push(`=== Victor Execute Mode Status ===`);
  lines.push(`Health: ${metrics.health.toUpperCase()}`);
  lines.push(`Tier: ${metrics.tier.name}`);
  lines.push(`Duration: ${formatDuration(metrics.tier.durationMs)}`);

  if (metrics.tier.isPaused) {
    lines.push('Status: PAUSED');
  }

  lines.push('');
  lines.push(`Actions: ${metrics.actions.totalSuccessfulActions} successful, ${metrics.actions.totalFailedActions} failed`);
  lines.push(`Success Rate: ${(metrics.actions.successRate * 100).toFixed(1)}%`);
  lines.push(`Productive Ticks: ${metrics.actions.totalProductiveTicks} total, ${metrics.actions.currentTierTicks} at current tier`);

  if (metrics.tier.activeTriggers.length > 0) {
    lines.push('');
    lines.push('Active Triggers:');
    for (const trigger of metrics.tier.activeTriggers) {
      lines.push(`  - ${trigger.description} (${trigger.severity})`);
    }
  }

  if (metrics.progress.targetTier) {
    lines.push('');
    lines.push(`Progress to ${metrics.progress.targetTierName}:`);
    lines.push(`  ${metrics.progress.percentComplete.toFixed(1)}% complete`);
    if (metrics.progress.eligible) {
      lines.push('  ✓ Promotion eligible');
    } else {
      for (const missing of metrics.progress.missingCriteria) {
        lines.push(`  ✗ ${missing}`);
      }
    }
  }

  if (metrics.alerts.length > 0) {
    lines.push('');
    lines.push('Alerts:');
    for (const alert of metrics.alerts.slice(0, 5)) {
      const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`  ${icon} ${alert.title}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format duration in human-readable form.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ============================================================================
// Export Formats
// ============================================================================

/**
 * Export metrics as JSON.
 */
export function exportMetricsToJSON(metrics: DashboardMetrics): string {
  return JSON.stringify(metrics, null, 2);
}

/**
 * Export metrics as compact summary for logging.
 */
export function exportMetricsToLogLine(metrics: DashboardMetrics): string {
  return [
    `tier=${metrics.tier.current}`,
    `health=${metrics.health}`,
    `ticks=${metrics.actions.totalProductiveTicks}`,
    `actions=${metrics.actions.totalSuccessfulActions}`,
    `success=${(metrics.actions.successRate * 100).toFixed(0)}%`,
    `progress=${metrics.progress.percentComplete.toFixed(0)}%`,
    `alerts=${metrics.alerts.length}`,
  ].join(' ');
}

// ============================================================================
// Alert Management
// ============================================================================

/** In-memory alert store (in production, this would be persistent) */
const acknowledgedAlerts = new Set<string>();

/**
 * Acknowledge an alert by ID.
 */
export function acknowledgeAlert(alertId: string): boolean {
  acknowledgedAlerts.add(alertId);
  return true;
}

/**
 * Check if an alert has been acknowledged.
 */
export function isAlertAcknowledged(alertId: string): boolean {
  return acknowledgedAlerts.has(alertId);
}

/**
 * Clear all acknowledged alerts.
 */
export function clearAcknowledgedAlerts(): void {
  acknowledgedAlerts.clear();
}
