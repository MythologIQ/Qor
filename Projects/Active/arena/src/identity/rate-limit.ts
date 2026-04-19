// HexaWars Arena — Identity Rate Limiter (Plan A v2, Phase 2)
// In-memory IP bucket: best-effort anti-abuse for open operator registration.
// Restart-reset is acceptable — not an authentication boundary.

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

export interface CheckResult {
  ok: boolean;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export const DEFAULT_CONFIG: RateLimitConfig = {
  max: 10,
  windowMs: 60 * 60 * 1000,
};

export interface RateLimiter {
  check(key: string, now?: number): CheckResult;
  reset(key: string): void;
  resetAll(): void;
  size(): number;
}

export function createLimiter(
  config: RateLimitConfig = DEFAULT_CONFIG,
): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    check(key: string, now: number = Date.now()): CheckResult {
      const b = buckets.get(key);
      if (!b || now - b.windowStart >= config.windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return { ok: true, retryAfterSec: 0 };
      }
      if (b.count < config.max) {
        b.count += 1;
        return { ok: true, retryAfterSec: 0 };
      }
      const retryAfterSec = Math.ceil(
        (b.windowStart + config.windowMs - now) / 1000,
      );
      return { ok: false, retryAfterSec };
    },
    reset(key: string): void {
      buckets.delete(key);
    },
    resetAll(): void {
      buckets.clear();
    },
    size(): number {
      return buckets.size;
    },
  };
}

export function keyFromHeaders(
  xForwardedFor: string | undefined,
  remoteAddr?: string,
): string {
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  if (remoteAddr) return remoteAddr;
  return "unknown";
}
