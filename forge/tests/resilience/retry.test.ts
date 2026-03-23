/**
 * Tests for retry logic with exponential backoff
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry, RETRY_PRESETS } from '../../runtime/resilience/retry.js';

describe('Retry Logic', () => {
  it('should succeed on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withRetry(operation);

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(1);
    expect(result.totalDelayMs).toBe(0);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, {
      maxAttempts: 5,
      baseDelayMs: 10, // Fast for testing
      maxDelayMs: 50,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(3);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should fail after max attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('network timeout'));

    const result = await withRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('network timeout');
    expect(result.attempts).toBe(3);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('validation error'));

    const result = await withRetry(operation, {
      maxAttempts: 5,
      shouldRetry: (error) => {
        if (error instanceof Error) {
          return error.message.includes('network');
        }
        return false;
      },
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1); // No retries
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should apply exponential backoff', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    const result = await withRetry(operation, {
      maxAttempts: 5,
      baseDelayMs: 50,
      backoffMultiplier: 2,
      jitterFactor: 0, // No jitter for predictable timing
    });
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    // First retry: 50ms, second retry: 100ms → ~150ms total
    expect(duration).toBeGreaterThanOrEqual(150);
    expect(duration).toBeLessThan(200); // Allow some overhead
  });

  it('should respect max delay', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 150, // Cap exponential growth
      backoffMultiplier: 4,
      jitterFactor: 0,
    });

    expect(result.success).toBe(true);
    // Without max: 100, 400, 1600
    // With max: 100, 150, 150
    expect(result.totalDelayMs).toBeLessThan(450);
  });

  it('should use NETWORK preset correctly', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, RETRY_PRESETS.NETWORK);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('should use CRITICAL preset for high retry counts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('network failure'));

    const result = await withRetry(operation, {
      ...RETRY_PRESETS.CRITICAL,
      baseDelayMs: 10, // Speed up for testing
      maxDelayMs: 50,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(10); // CRITICAL allows 10 attempts
  });

  it('should add jitter to delays', async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    // Capture delay values
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay?: number) => {
      delays.push(delay ?? 0);
      return originalSetTimeout(callback, 0) as any; // Execute immediately for testing
    });

    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    await withRetry(operation, {
      maxAttempts: 5,
      baseDelayMs: 100,
      backoffMultiplier: 2,
      jitterFactor: 0.2, // 20% jitter
    });

    // With jitter, delays should vary around base values
    expect(delays.length).toBe(2);
    expect(delays[0]).toBeGreaterThan(80); // Base 100 ± 20%
    expect(delays[0]).toBeLessThan(120);
    expect(delays[1]).toBeGreaterThan(160); // Base 200 ± 20%
    expect(delays[1]).toBeLessThan(240);

    vi.restoreAllMocks();
  });
});
