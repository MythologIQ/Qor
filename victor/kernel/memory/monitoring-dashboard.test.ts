/**
 * Tests for monitoring-dashboard.ts
 */

import { describe, it, expect } from 'bun:test';
import type { ExecuteGovernanceState } from './execute-governance';
import {
  generateDashboardMetrics,
  createHistoricalDataPoint,
  buildHistoricalMetrics,
  generateStatusSummary,
  exportMetricsToJSON,
  exportMetricsToLogLine,
  acknowledgeAlert,
  isAlertAcknowledged,
  clearAcknowledgedAlerts,
  type DashboardMetrics,
  type HistoricalDataPoint,
} from './monitoring-dashboard';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockGovernanceState(overrides: Partial<ExecuteGovernanceState> = {}): ExecuteGovernanceState {
  return {
    currentTier: 1,
    tierEnteredAt: new Date().toISOString(),
    totalProductiveTicks: 10,
    currentTierTicks: 10,
    totalSuccessfulActions: 8,
    currentTierSuccessfulActions: 8,
    consecutiveBlocked: 0,
    consecutiveFailures: 0,
    tierHistory: [],
    activeTriggers: [],
    isPaused: false,
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Dashboard Metrics Generation Tests
// ============================================================================

describe('Dashboard Metrics Generation', () => {
  it('should generate metrics with all required fields', () => {
    const state = createMockGovernanceState();
    const metrics = generateDashboardMetrics(state);

    expect(metrics.timestamp).toBeDefined();
    expect(metrics.health).toBeOneOf(['healthy', 'degraded', 'critical', 'paused']);
    expect(metrics.tier).toBeDefined();
    expect(metrics.actions).toBeDefined();
    expect(metrics.progress).toBeDefined();
    expect(metrics.alerts).toBeArray();
    expect(metrics.activity).toBeDefined();
  });

  it('should calculate healthy status for normal operation', () => {
    const state = createMockGovernanceState();
    const metrics = generateDashboardMetrics(state);
    expect(metrics.health).toBe('healthy');
  });

  it('should calculate paused status when paused', () => {
    const state = createMockGovernanceState({ isPaused: true });
    const metrics = generateDashboardMetrics(state);
    expect(metrics.health).toBe('paused');
  });

  it('should calculate degraded status with active triggers', () => {
    const state = createMockGovernanceState({
      activeTriggers: ['consecutive_blocked'],
    });
    const metrics = generateDashboardMetrics(state);
    expect(metrics.health).toBe('degraded');
  });

  it('should calculate degraded status near blocked threshold', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      consecutiveBlocked: 3, // Tier 2 threshold is 3
    });
    const metrics = generateDashboardMetrics(state);
    expect(metrics.health).toBe('degraded');
  });

  it('should include correct tier information', () => {
    const state = createMockGovernanceState({ currentTier: 2 });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.tier.current).toBe(2);
    expect(metrics.tier.name).toBe('Assisted (Tier 2)');
    expect(metrics.tier.isPaused).toBe(false);
    expect(metrics.tier.capabilities.canExecuteWrites).toBe(true);
    expect(metrics.tier.capabilities.canExecuteWithoutApproval).toBe(false);
  });

  it('should track duration at current tier', () => {
    const enteredAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const state = createMockGovernanceState({ tierEnteredAt: enteredAt });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.tier.durationMs).toBeGreaterThanOrEqual(3600000);
    expect(metrics.tier.enteredAt).toBe(enteredAt);
  });

  it('should calculate action metrics correctly', () => {
    const state = createMockGovernanceState({
      totalProductiveTicks: 100,
      totalSuccessfulActions: 85,
      currentTierTicks: 50,
      currentTierSuccessfulActions: 40,
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.actions.totalProductiveTicks).toBe(100);
    expect(metrics.actions.totalSuccessfulActions).toBe(85);
    expect(metrics.actions.successRate).toBe(0.85);
    expect(metrics.actions.currentTierTicks).toBe(50);
    expect(metrics.actions.currentTierSuccessfulActions).toBe(40);
  });

  it('should detect near-blocked threshold', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      consecutiveBlocked: 2, // Threshold is 3, 80% = 2.4
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.actions.nearBlockedThreshold).toBe(true);
  });

  it('should detect near-failure threshold', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      consecutiveFailures: 1, // Threshold is 2, 80% = 1.6
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.actions.nearFailureThreshold).toBe(true);
  });

  it('should track active triggers with descriptions', () => {
    const state = createMockGovernanceState({
      activeTriggers: ['consecutive_blocked', 'user_override'],
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.tier.activeTriggers).toHaveLength(2);
    expect(metrics.tier.activeTriggers[0].type).toBe('consecutive_blocked');
    expect(metrics.tier.activeTriggers[0].description).toBeDefined();
    expect(metrics.tier.activeTriggers[0].severity).toBeOneOf(['warning', 'critical']);
  });
});

// ============================================================================
// Tier Progress Tests
// ============================================================================

describe('Tier Progress', () => {
  it('should show promotion eligibility at Tier 1', () => {
    const state = createMockGovernanceState({
      currentTier: 1,
      currentTierTicks: 50,
      currentTierSuccessfulActions: 10,
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.progress.targetTier).toBe(2);
    expect(metrics.progress.targetTierName).toBe('Assisted (Tier 2)');
    expect(metrics.progress.percentComplete).toBeGreaterThan(0);
  });

  it('should show 100% complete at Tier 3', () => {
    const state = createMockGovernanceState({ currentTier: 3 });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.progress.percentComplete).toBe(100);
    expect(metrics.progress.targetTier).toBeUndefined();
  });

  it('should track criteria for promotion', () => {
    const state = createMockGovernanceState({
      currentTier: 1,
      currentTierTicks: 25,
      currentTierSuccessfulActions: 5,
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.progress.missingCriteria.length).toBeGreaterThan(0);
    expect(metrics.progress.eligible).toBe(false);
  });
});

// ============================================================================
// Alert Generation Tests
// ============================================================================

describe('Alert Generation', () => {
  it('should generate promotion eligible alert', () => {
    const state = createMockGovernanceState({
      currentTier: 1,
      currentTierTicks: 50,
      currentTierSuccessfulActions: 10,
      totalProductiveTicks: 50,
      totalSuccessfulActions: 10,
    });
    const metrics = generateDashboardMetrics(state);

    const promotionAlert = metrics.alerts.find((a) => a.category === 'tier' && a.title.includes('Promotion'));
    expect(promotionAlert).toBeDefined();
    expect(promotionAlert?.severity).toBe('info');
  });

  it('should generate near-threshold warnings', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      consecutiveBlocked: 2,
    });
    const metrics = generateDashboardMetrics(state);

    const thresholdAlert = metrics.alerts.find((a) => a.title.includes('Blocked Ticks'));
    expect(thresholdAlert).toBeDefined();
    expect(thresholdAlert?.severity).toBe('warning');
  });

  it('should generate revocation alerts for critical triggers', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      activeTriggers: ['policy_violation'],
    });
    const metrics = generateDashboardMetrics(state);

    const revocationAlert = metrics.alerts.find((a) => a.title.includes('Revocation'));
    expect(revocationAlert).toBeDefined();
    expect(revocationAlert?.severity).toBe('critical');
  });

  it('should generate paused alert when paused', () => {
    const state = createMockGovernanceState({ isPaused: true });
    const metrics = generateDashboardMetrics(state);

    const pausedAlert = metrics.alerts.find((a) => a.title.includes('Paused'));
    expect(pausedAlert).toBeDefined();
    expect(pausedAlert?.severity).toBe('info');
  });

  it('should respect max alerts limit', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      activeTriggers: ['consecutive_blocked', 'consecutive_failures'],
      consecutiveBlocked: 2,
      consecutiveFailures: 1,
    });
    const metrics = generateDashboardMetrics(state, { maxAlerts: 2 });

    expect(metrics.alerts.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Activity Summary Tests
// ============================================================================

describe('Activity Summary', () => {
  it('should track idle status', () => {
    const lastUpdate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const state = createMockGovernanceState({
      lastUpdatedAt: lastUpdate,
      totalProductiveTicks: 10,
    });
    const metrics = generateDashboardMetrics(state, { idleThresholdMs: 5 * 60 * 1000 });

    expect(metrics.activity.isIdle).toBe(true);
    expect(metrics.activity.timeSinceLastProductiveTick).toBeGreaterThan(0);
  });

  it('should show not idle when recently active', () => {
    const state = createMockGovernanceState({
      lastUpdatedAt: new Date().toISOString(),
      totalProductiveTicks: 10,
    });
    const metrics = generateDashboardMetrics(state, { idleThresholdMs: 60000 });

    expect(metrics.activity.isIdle).toBe(false);
  });

  it('should include recent transitions', () => {
    const state = createMockGovernanceState({
      tierHistory: [
        { from: 1, to: 2, timestamp: new Date().toISOString(), reason: 'promotion' },
      ],
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.activity.recentTransitions).toHaveLength(1);
  });
});

// ============================================================================
// Historical Data Tests
// ============================================================================

describe('Historical Data', () => {
  it('should create historical data point', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      totalProductiveTicks: 100,
      totalSuccessfulActions: 85,
      activeTriggers: ['consecutive_blocked'],
    });
    const point = createHistoricalDataPoint(state);

    expect(point.timestamp).toBeDefined();
    expect(point.tier).toBe(2);
    expect(point.productiveTicks).toBe(100);
    expect(point.successfulActions).toBe(85);
    expect(point.failedActions).toBe(15);
    expect(point.activeTriggersCount).toBe(1);
  });

  it('should build historical metrics', () => {
    const points: HistoricalDataPoint[] = [
      { timestamp: '2026-03-18T10:00:00Z', tier: 1, productiveTicks: 10, successfulActions: 8, failedActions: 2, activeTriggersCount: 0 },
      { timestamp: '2026-03-18T11:00:00Z', tier: 2, productiveTicks: 50, successfulActions: 40, failedActions: 10, activeTriggersCount: 0 },
    ];
    const historical = buildHistoricalMetrics(points);

    expect(historical).not.toBeNull();
    expect(historical?.startTime).toBe('2026-03-18T10:00:00Z');
    expect(historical?.endTime).toBe('2026-03-18T11:00:00Z');
    expect(historical?.dataPoints).toHaveLength(2);
  });

  it('should return null for empty data points', () => {
    const historical = buildHistoricalMetrics([]);
    expect(historical).toBeNull();
  });
});

// ============================================================================
// Status Summary Tests
// ============================================================================

describe('Status Summary', () => {
  it('should generate human-readable summary', () => {
    const state = createMockGovernanceState();
    const metrics = generateDashboardMetrics(state);
    const summary = generateStatusSummary(metrics);

    expect(summary).toContain('Victor Execute Mode Status');
    expect(summary).toContain('HEALTHY');
    expect(summary).toContain('Tier 1');
    expect(summary).toContain('Actions:');
  });

  it('should include alerts in summary', () => {
    const state = createMockGovernanceState({
      currentTier: 2,
      consecutiveBlocked: 2,
    });
    const metrics = generateDashboardMetrics(state);
    const summary = generateStatusSummary(metrics);

    expect(summary).toContain('Alerts:');
  });
});

// ============================================================================
// Export Format Tests
// ============================================================================

describe('Export Formats', () => {
  it('should export to JSON', () => {
    const state = createMockGovernanceState();
    const metrics = generateDashboardMetrics(state);
    const json = exportMetricsToJSON(metrics);

    const parsed = JSON.parse(json);
    expect(parsed.timestamp).toBe(metrics.timestamp);
    expect(parsed.health).toBe(metrics.health);
  });

  it('should export to log line', () => {
    const state = createMockGovernanceState();
    const metrics = generateDashboardMetrics(state);
    const logLine = exportMetricsToLogLine(metrics);

    expect(logLine).toContain('tier=1');
    expect(logLine).toContain('health=healthy');
    expect(logLine).toContain('ticks=');
    expect(logLine).toContain('success=');
  });
});

// ============================================================================
// Alert Management Tests
// ============================================================================

describe('Alert Management', () => {
  it('should acknowledge alerts', () => {
    clearAcknowledgedAlerts();
    acknowledgeAlert('alert-1');
    expect(isAlertAcknowledged('alert-1')).toBe(true);
  });

  it('should track multiple acknowledged alerts', () => {
    clearAcknowledgedAlerts();
    acknowledgeAlert('alert-1');
    acknowledgeAlert('alert-2');
    expect(isAlertAcknowledged('alert-1')).toBe(true);
    expect(isAlertAcknowledged('alert-2')).toBe(true);
    expect(isAlertAcknowledged('alert-3')).toBe(false);
  });

  it('should clear acknowledged alerts', () => {
    acknowledgeAlert('alert-1');
    clearAcknowledgedAlerts();
    expect(isAlertAcknowledged('alert-1')).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle zero productive ticks', () => {
    const state = createMockGovernanceState({
      totalProductiveTicks: 0,
      totalSuccessfulActions: 0,
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.actions.successRate).toBe(0);
    expect(metrics.activity.timeSinceLastProductiveTick).toBeNull();
  });

  it('should handle many active triggers', () => {
    const state = createMockGovernanceState({
      activeTriggers: ['consecutive_blocked', 'consecutive_failures', 'user_override', 'policy_violation'],
    });
    const metrics = generateDashboardMetrics(state);

    expect(metrics.tier.activeTriggers).toHaveLength(4);
    expect(metrics.health).toBe('critical'); // policy_violation causes critical health
  });

  it('should handle tier history with multiple transitions', () => {
    const history = [
      { from: 1 as const, to: 2 as const, timestamp: '2026-03-18T10:00:00Z', reason: 'promotion' as const },
      { from: 2 as const, to: 1 as const, timestamp: '2026-03-18T11:00:00Z', reason: 'demotion' as const, trigger: 'consecutive_failures' },
      { from: 1 as const, to: 2 as const, timestamp: '2026-03-18T12:00:00Z', reason: 'promotion' as const },
    ];
    const state = createMockGovernanceState({ tierHistory: history });
    const metrics = generateDashboardMetrics(state, { maxTransitions: 2 });

    expect(metrics.activity.recentTransitions).toHaveLength(2);
  });
});
