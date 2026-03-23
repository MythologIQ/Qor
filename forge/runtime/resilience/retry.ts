/**
 * Retry Logic with Exponential Backoff
 * 
 * Provides configurable retry behavior for transient failures with:
 * - Exponential backoff to prevent thundering herd
 * - Jitter to spread retries across time
 * - Configurable max attempts and backoff parameters
 * - Predicate-based retry decisions (which errors are retryable)
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1, amount of randomization to add
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  shouldRetry: (error: unknown) => {
    // Default: retry on network errors, timeouts, 5xx server errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
      );
    }
    return false;
  },
};

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: unknown;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Execute an async operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      const value = await operation();
      return {
        success: true,
        value,
        attempts: attempt,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      const shouldRetry = finalConfig.shouldRetry?.(error, attempt) ?? false;
      const isLastAttempt = attempt === finalConfig.maxAttempts;

      if (!shouldRetry || isLastAttempt) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalDelayMs,
        };
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = Math.min(
        finalConfig.baseDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
        finalConfig.maxDelayMs
      );

      const jitter = exponentialDelay * finalConfig.jitterFactor * (Math.random() - 0.5) * 2;
      const delay = Math.max(0, exponentialDelay + jitter);
      totalDelayMs += delay;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    success: false,
    error: lastError,
    attempts: finalConfig.maxAttempts,
    totalDelayMs,
  };
}

/**
 * Retry configuration presets for common scenarios
 */
export const RETRY_PRESETS = {
  /** Fast retries for transient network issues */
  NETWORK: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  } as Partial<RetryConfig>,

  /** Patient retries for external service dependencies */
  EXTERNAL_SERVICE: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  } as Partial<RetryConfig>,

  /** Aggressive retries for critical operations */
  CRITICAL: {
    maxAttempts: 10,
    baseDelayMs: 200,
    maxDelayMs: 30000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.25,
  } as Partial<RetryConfig>,

  /** Single retry for idempotency checks */
  IDEMPOTENT: {
    maxAttempts: 2,
    baseDelayMs: 50,
    maxDelayMs: 100,
    backoffMultiplier: 1,
    jitterFactor: 0.1,
  } as Partial<RetryConfig>,
};
