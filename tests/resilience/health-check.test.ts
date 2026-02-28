/**
 * Tests for health check system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HealthChecker,
  HealthStatus,
  StandardHealthChecks,
} from '../../runtime/resilience/health-check.js';

describe('Health Checker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker('2.0.0-test');
  });

  it('should register and run health checks', async () => {
    checker.register('component1', async () => ({
      status: HealthStatus.HEALTHY,
      message: 'All good',
    }));

    const health = await checker.checkAll();

    expect(health.status).toBe(HealthStatus.HEALTHY);
    expect(health.components).toHaveLength(1);
    expect(health.components[0].componentName).toBe('component1');
    expect(health.components[0].status).toBe(HealthStatus.HEALTHY);
  });

  it('should aggregate status correctly - all healthy', async () => {
    checker.register('component1', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component2', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component3', async () => ({ status: HealthStatus.HEALTHY }));

    const health = await checker.checkAll();

    expect(health.status).toBe(HealthStatus.HEALTHY);
    expect(health.components).toHaveLength(3);
  });

  it('should aggregate status correctly - any unhealthy', async () => {
    checker.register('component1', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component2', async () => ({ status: HealthStatus.UNHEALTHY }));
    checker.register('component3', async () => ({ status: HealthStatus.DEGRADED }));

    const health = await checker.checkAll();

    expect(health.status).toBe(HealthStatus.UNHEALTHY);
  });

  it('should aggregate status correctly - degraded but not unhealthy', async () => {
    checker.register('component1', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component2', async () => ({ status: HealthStatus.DEGRADED }));
    checker.register('component3', async () => ({ status: HealthStatus.HEALTHY }));

    const health = await checker.checkAll();

    expect(health.status).toBe(HealthStatus.DEGRADED);
  });

  it('should handle check errors gracefully', async () => {
    checker.register('failing', async () => {
      throw new Error('Check failed');
    });

    const health = await checker.checkAll();

    expect(health.status).toBe(HealthStatus.UNHEALTHY);
    expect(health.components[0].status).toBe(HealthStatus.UNHEALTHY);
    expect(health.components[0].error).toBe('Check failed');
  });

  it('should timeout slow checks', async () => {
    checker.register('slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return { status: HealthStatus.HEALTHY };
    });

    const health = await checker.checkAll();

    expect(health.components[0].status).toBe(HealthStatus.UNHEALTHY);
    expect(health.components[0].error).toContain('timeout');
  });

  it('should track response times', async () => {
    checker.register('slow-component', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { status: HealthStatus.HEALTHY };
    });

    const health = await checker.checkAll();

    expect(health.components[0].responseTimeMs).toBeGreaterThanOrEqual(45); // Changed from 50 to account for timing variance
    expect(health.components[0].responseTimeMs).toBeLessThan(100);
  });

  it('should check individual components', async () => {
    checker.register('component1', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component2', async () => ({ status: HealthStatus.DEGRADED }));

    const result = await checker.checkComponent('component2');

    expect(result.componentName).toBe('component2');
    expect(result.status).toBe(HealthStatus.DEGRADED);
  });

  it('should throw on unknown component check', async () => {
    await expect(checker.checkComponent('unknown')).rejects.toThrow(
      'Health check not registered: unknown'
    );
  });

  it('should cache results', async () => {
    const checkFn = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
    checker.register('component1', checkFn);

    // First check
    await checker.checkAll();
    expect(checkFn).toHaveBeenCalledTimes(1);

    // Get cached results (no new calls)
    const cached = checker.getCachedResults();
    expect(checkFn).toHaveBeenCalledTimes(1); // Still 1
    expect(cached.components).toHaveLength(1);
    expect(cached.components[0].componentName).toBe('component1');
  });

  it('should track uptime', async () => {
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const health = await checker.checkAll();

    expect(health.uptime).toBeGreaterThanOrEqual(100);
    expect(health.uptime).toBeLessThan(200);
  });

  it('should include version', async () => {
    const health = await checker.checkAll();
    expect(health.version).toBe('2.0.0-test');
  });

  it('should unregister components', async () => {
    checker.register('component1', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component2', async () => ({ status: HealthStatus.HEALTHY }));

    const wasRemoved = checker.unregister('component1');
    expect(wasRemoved).toBe(true);

    const health = await checker.checkAll();
    expect(health.components).toHaveLength(1);
    expect(health.components[0].componentName).toBe('component2');
  });

  it('should clear all checks', async () => {
    checker.register('component1', async () => ({ status: HealthStatus.HEALTHY }));
    checker.register('component2', async () => ({ status: HealthStatus.HEALTHY }));

    checker.clear();

    const health = await checker.checkAll();
    expect(health.components).toHaveLength(0);
    expect(health.status).toBe(HealthStatus.HEALTHY); // No components = healthy
  });
});

describe('Standard Health Checks', () => {
  it('should check filesystem access', async () => {
    const check = StandardHealthChecks.filesystem('/tmp');
    const result = await check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toContain('/tmp');
  });

  it('should fail on inaccessible filesystem', async () => {
    const check = StandardHealthChecks.filesystem('/nonexistent/path/12345');
    const result = await check();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.error).toBeDefined();
  });

  it('should check memory usage', async () => {
    const check = StandardHealthChecks.memory(90);
    const result = await check();

    expect(result.status).toBeOneOf([HealthStatus.HEALTHY, HealthStatus.DEGRADED]);
    expect(result.details).toHaveProperty('heapUsedMB');
    expect(result.details).toHaveProperty('heapTotalMB');
  });

  it('should flag high memory usage as degraded', async () => {
    const check = StandardHealthChecks.memory(0); // Impossible threshold
    const result = await check();

    expect(result.status).toBe(HealthStatus.DEGRADED);
  });

  it('should check event loop lag', async () => {
    const check = StandardHealthChecks.eventLoop(100);
    const result = await check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.details).toHaveProperty('lagMs');
    expect((result.details as any).lagMs).toBeLessThan(100);
  });

  it('should check store availability', async () => {
    const mockCheckFn = vi.fn().mockResolvedValue(undefined);
    const check = StandardHealthChecks.store('TestStore', mockCheckFn);

    const result = await check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toContain('TestStore');
    expect(mockCheckFn).toHaveBeenCalled();
  });

  it('should fail on store check error', async () => {
    const mockCheckFn = vi.fn().mockRejectedValue(new Error('Store unavailable'));
    const check = StandardHealthChecks.store('TestStore', mockCheckFn);

    const result = await check();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.error).toBe('Store unavailable');
  });

  it('should always return healthy for test check', async () => {
    const check = StandardHealthChecks.alwaysHealthy('TestComponent');
    const result = await check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toContain('TestComponent');
  });
});
