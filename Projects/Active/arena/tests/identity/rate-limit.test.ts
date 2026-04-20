import { test, expect, describe } from "bun:test";
import {
  createLimiter,
  keyFromHeaders,
  DEFAULT_CONFIG,
} from "../../src/identity/rate-limit";

describe("rate-limit", () => {
  test("10 checks pass for single IP within window", () => {
    const lim = createLimiter();
    for (let i = 0; i < 10; i++) {
      const r = lim.check("1.2.3.4");
      expect(r.ok).toBe(true);
      expect(r.retryAfterSec).toBe(0);
    }
  });

  test("11th check returns ok=false with positive retryAfterSec", () => {
    const lim = createLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) lim.check("1.2.3.4", t0 + i);
    const r = lim.check("1.2.3.4", t0 + 10);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(r.retryAfterSec).toBeLessThanOrEqual(
      Math.ceil(DEFAULT_CONFIG.windowMs / 1000),
    );
  });

  test("bucket resets after window expiry", () => {
    const lim = createLimiter({ max: 3, windowMs: 1000 });
    const t0 = 0;
    for (let i = 0; i < 3; i++) lim.check("k", t0);
    expect(lim.check("k", t0 + 500).ok).toBe(false);
    expect(lim.check("k", t0 + 1001).ok).toBe(true);
  });

  test("different keys have independent buckets", () => {
    const lim = createLimiter({ max: 2, windowMs: 10_000 });
    expect(lim.check("a").ok).toBe(true);
    expect(lim.check("a").ok).toBe(true);
    expect(lim.check("a").ok).toBe(false);
    expect(lim.check("b").ok).toBe(true);
    expect(lim.check("b").ok).toBe(true);
    expect(lim.check("b").ok).toBe(false);
  });

  test("configured limits are respected", () => {
    const lim = createLimiter({ max: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) expect(lim.check("x").ok).toBe(true);
    expect(lim.check("x").ok).toBe(false);
  });

  test("reset clears a bucket", () => {
    const lim = createLimiter({ max: 1, windowMs: 10_000 });
    expect(lim.check("z").ok).toBe(true);
    expect(lim.check("z").ok).toBe(false);
    lim.reset("z");
    expect(lim.check("z").ok).toBe(true);
  });

  test("keyFromHeaders prefers XFF first entry", () => {
    expect(keyFromHeaders("1.1.1.1, 2.2.2.2", "3.3.3.3")).toBe("1.1.1.1");
  });

  test("keyFromHeaders strips whitespace", () => {
    expect(keyFromHeaders(" 10.0.0.1 ", undefined)).toBe("10.0.0.1");
  });

  test("keyFromHeaders falls back to remote", () => {
    expect(keyFromHeaders(undefined, "5.5.5.5")).toBe("5.5.5.5");
  });

  test("keyFromHeaders falls back to unknown", () => {
    expect(keyFromHeaders(undefined, undefined)).toBe("unknown");
  });
});
