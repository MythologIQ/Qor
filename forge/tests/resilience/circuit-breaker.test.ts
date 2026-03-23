/**
 * Tests for circuit breaker pattern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  CircuitBreakerRegistry,
} from '../../runtime/resilience/circuit-breaker.js';

describe('Circuit Breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker('test');
    const status = breaker.getStatus();

    expect(status.state).toBe(CircuitState.CLOSED);
    expect(status.metrics.failures).toBe(0);
  });

  it('should allow requests in CLOSED state', async () => {
    const breaker = new CircuitBreaker('test');
    const operation = vi.fn().mockResolvedValue('success');

    const result = await breaker.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should transition to OPEN after failure threshold', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      windowMs: 60000,
    });

    const operation = vi.fn().mockRejectedValue(new Error('failure'));

    // Fail 3 times to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(operation);
      } catch {
        // Expected
      }
    }

    const status = breaker.getStatus();
    expect(status.state).toBe(CircuitState.OPEN);
    expect(status.metrics.totalFailures).toBe(3);
  });

  it('should fail fast when OPEN', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
    });

    const operation = vi.fn().mockRejectedValue(new Error('failure'));

    // Open the circuit
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);

    // Next request should fail immediately without calling operation
    operation.mockClear();
    await expect(breaker.execute(operation)).rejects.toThrow(CircuitOpenError);
    expect(operation).not.toHaveBeenCalled();
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 30000,
    });

    const operation = vi.fn().mockRejectedValue(new Error('failure'));

    // Open the circuit
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);

    // Advance time past reset timeout
    vi.advanceTimersByTime(31000);

    // Next request should transition to HALF_OPEN
    operation.mockResolvedValue('success');
    await breaker.execute(operation);

    expect(breaker.getStatus().state).toBe(CircuitState.HALF_OPEN);
  });

  it('should transition HALF_OPEN to CLOSED on success', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 30000,
      successThreshold: 2,
    });

    const operation = vi.fn();

    // Open circuit
    operation.mockRejectedValue(new Error('failure'));
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    // Wait for reset timeout
    vi.advanceTimersByTime(31000);

    // Succeed enough times to close
    operation.mockResolvedValue('success');
    await breaker.execute(operation); // HALF_OPEN
    await breaker.execute(operation); // Should transition to CLOSED

    expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);
  });

  it('should transition HALF_OPEN to OPEN on failure', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 30000,
    });

    const operation = vi.fn();

    // Open circuit
    operation.mockRejectedValue(new Error('failure'));
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    // Wait for reset timeout
    vi.advanceTimersByTime(31000);

    // First success transitions to HALF_OPEN
    operation.mockResolvedValue('success');
    await breaker.execute(operation);
    expect(breaker.getStatus().state).toBe(CircuitState.HALF_OPEN);

    // Failure should re-open
    operation.mockRejectedValue(new Error('still failing'));
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);
  });

  it('should respect isFailure predicate', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      isFailure: (error) => {
        return error instanceof Error && error.message.includes('critical');
      },
    });

    const operation = vi.fn();

    // Non-critical errors should not count
    operation.mockRejectedValue(new Error('minor issue'));
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);

    // Critical errors should count
    operation.mockRejectedValue(new Error('critical failure'));
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);
  });

  it('should track metrics correctly', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 5,
    });

    const operation = vi.fn();

    // Mix of successes and failures
    operation.mockResolvedValue('success');
    await breaker.execute(operation);
    await breaker.execute(operation);

    operation.mockRejectedValue(new Error('failure'));
    try {
      await breaker.execute(operation);
    } catch {}

    operation.mockResolvedValue('success');
    await breaker.execute(operation);

    const status = breaker.getStatus();
    expect(status.metrics.totalRequests).toBe(4);
    expect(status.metrics.totalSuccesses).toBe(3);
    expect(status.metrics.totalFailures).toBe(1);
  });

  it('should reset manually', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
    });

    const operation = vi.fn().mockRejectedValue(new Error('failure'));

    // Open circuit
    try {
      await breaker.execute(operation);
    } catch {}
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);

    // Manual reset
    breaker.reset();

    const status = breaker.getStatus();
    expect(status.state).toBe(CircuitState.CLOSED);
    expect(status.metrics.totalFailures).toBe(0);
    expect(status.metrics.totalSuccesses).toBe(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('Circuit Breaker Registry', () => {
  it('should create and retrieve breakers', () => {
    const registry = new CircuitBreakerRegistry();

    const breaker1 = registry.getOrCreate('service1');
    const breaker2 = registry.getOrCreate('service2');

    expect(breaker1).toBeInstanceOf(CircuitBreaker);
    expect(breaker2).toBeInstanceOf(CircuitBreaker);
    expect(breaker1).not.toBe(breaker2);

    // Getting same name should return same instance
    const breaker1Again = registry.getOrCreate('service1');
    expect(breaker1Again).toBe(breaker1);
  });

  it('should get all breakers', () => {
    const registry = new CircuitBreakerRegistry();

    registry.getOrCreate('service1');
    registry.getOrCreate('service2');
    registry.getOrCreate('service3');

    const all = registry.getAll();
    expect(all).toHaveLength(3);
  });

  it('should get all status', () => {
    const registry = new CircuitBreakerRegistry();

    registry.getOrCreate('service1');
    registry.getOrCreate('service2');

    const statuses = registry.getAllStatus();
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveProperty('name');
    expect(statuses[0]).toHaveProperty('state');
  });

  it('should reset individual breaker', async () => {
    const registry = new CircuitBreakerRegistry();
    const breaker = registry.getOrCreate('service1', { failureThreshold: 1 });

    const operation = vi.fn().mockRejectedValue(new Error('failure'));

    // Open circuit
    try {
      await breaker.execute(operation);
    } catch {}

    expect(breaker.getStatus().state).toBe(CircuitState.OPEN);

    // Reset via registry
    const wasReset = registry.reset('service1');
    expect(wasReset).toBe(true);
    expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);
  });

  it('should reset all breakers', async () => {
    const registry = new CircuitBreakerRegistry();
    const breaker1 = registry.getOrCreate('service1', { failureThreshold: 1 });
    const breaker2 = registry.getOrCreate('service2', { failureThreshold: 1 });

    const operation = vi.fn().mockRejectedValue(new Error('failure'));

    // Open both circuits
    try {
      await breaker1.execute(operation);
    } catch {}
    try {
      await breaker2.execute(operation);
    } catch {}

    expect(breaker1.getStatus().state).toBe(CircuitState.OPEN);
    expect(breaker2.getStatus().state).toBe(CircuitState.OPEN);

    // Reset all
    registry.resetAll();

    expect(breaker1.getStatus().state).toBe(CircuitState.CLOSED);
    expect(breaker2.getStatus().state).toBe(CircuitState.CLOSED);
  });
});
