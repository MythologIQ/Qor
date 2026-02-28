/**
 * Rate Limiter Middleware
 *
 * Provides token bucket-based rate limiting for API endpoints.
 * Prevents abuse and DoS attacks by limiting request frequency per client.
 */

import * as http from "http";

export interface RateLimitConfig {
  /** Maximum number of tokens in the bucket */
  maxTokens: number;
  /** Tokens refilled per second */
  refillRate: number;
  /** How long to remember clients (ms) */
  windowMs: number;
  /** Key extractor function (defaults to IP) */
  keyExtractor?: (req: http.IncomingMessage) => string;
  /** Custom response for rate limit exceeded */
  onLimitExceeded?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Rate limiter with automatic cleanup of expired entries
 */
export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      keyExtractor: config.keyExtractor ?? defaultKeyExtractor,
      onLimitExceeded: config.onLimitExceeded ?? defaultLimitExceeded,
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Middleware wrapper for HTTP handler
   */
  middleware<T extends (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>>(
    handler: T
  ): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
    return async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const key = this.config.keyExtractor(req);

      if (!this.tryConsume(key)) {
        this.config.onLimitExceeded(req, res);
        return;
      }

      await handler(req, res);
    };
  }

  /**
   * Try to consume a token for the given key
   */
  private tryConsume(key: string): boolean {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.refillRate;
    bucket.tokens = Math.min(this.config.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Try to consume
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    // Clean up every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiry = this.config.windowMs;

      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > expiry) {
          this.buckets.delete(key);
        }
      }
    }, 60000);
  }

  /**
   * Stop cleanup and clear all buckets
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }

  /**
   * Get current bucket count (for monitoring)
   */
  getBucketCount(): number {
    return this.buckets.size;
  }

  /**
   * Reset all rate limits (for testing)
   */
  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Default key extractor: use client IP
 */
function defaultKeyExtractor(req: http.IncomingMessage): string {
  // Try various headers for client IP
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    if (Array.isArray(forwarded)) {
      return forwarded[0].split(",")[0].trim();
    }
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    if (Array.isArray(realIp)) {
      return realIp[0];
    }
    return realIp;
  }

  // Fallback to socket address
  return req.socket.remoteAddress || "unknown";
}

/**
 * Default rate limit exceeded response
 */
function defaultLimitExceeded(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(429, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: "Too many requests. Please try again later.",
    })
  );
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimiters = {
  /**
   * Strict: 10 requests per minute (for sensitive operations)
   */
  strict: new RateLimiter({
    maxTokens: 10,
    refillRate: 10 / 60, // 10 per minute
    windowMs: 5 * 60 * 1000, // Remember for 5 minutes
  }),

  /**
   * Standard: 60 requests per minute (for normal API usage)
   */
  standard: new RateLimiter({
    maxTokens: 60,
    refillRate: 1, // 60 per minute
    windowMs: 5 * 60 * 1000,
  }),

  /**
   * Relaxed: 300 requests per minute (for high-frequency operations)
   */
  relaxed: new RateLimiter({
    maxTokens: 300,
    refillRate: 5, // 300 per minute
    windowMs: 5 * 60 * 1000,
  }),
};
