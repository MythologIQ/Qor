import { describe, expect, test } from "bun:test";
import { elo } from "../../src/rank/elo";

describe("elo", () => {
  test("equal ratings + scoreA=1 → +16/-16 (K=32)", () => {
    const result = elo({ ratingA: 1500, ratingB: 1500, scoreA: 1, kFactor: 32 });
    expect(result.newA).toBe(1516);
    expect(result.newB).toBe(1484);
    expect(result.delta).toBe(16);
  });

  test("known fixture: 1600 vs 1400, A wins", () => {
    const result = elo({ ratingA: 1600, ratingB: 1400, scoreA: 1 });
    expect(result.newA).toBeGreaterThan(1600);
    expect(result.newA).toBeLessThanOrEqual(1610);
    expect(result.newB).toBeGreaterThan(1390);
    expect(result.newB).toBeLessThan(1400);
  });

  test("symmetry: A vs B mirrors B vs A", () => {
    const forward = elo({ ratingA: 1500, ratingB: 1600, scoreA: 1 });
    const reverse = elo({ ratingA: 1600, ratingB: 1500, scoreA: 0 });
    expect(forward.newA).toBe(reverse.newB);
    expect(forward.newB).toBe(reverse.newA);
  });

  test("scoreA=0 (A loses completely)", () => {
    const result = elo({ ratingA: 1500, ratingB: 1500, scoreA: 0 });
    expect(result.newA).toBe(1484);
    expect(result.newB).toBe(1516);
  });

  test("K=16 halves the update", () => {
    const result = elo({ ratingA: 1500, ratingB: 1500, scoreA: 1, kFactor: 16 });
    expect(result.newA).toBe(1508);
    expect(result.newB).toBe(1492);
  });

  test("delta is newA minus ratingA", () => {
    const result = elo({ ratingA: 1500, ratingB: 1500, scoreA: 1 });
    expect(result.delta).toBe(result.newA - 1500);
  });
});