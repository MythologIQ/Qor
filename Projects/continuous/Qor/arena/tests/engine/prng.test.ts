import { describe, it, expect } from "bun:test";
import { SeededRNG } from "../../src/engine/prng";

describe("SeededRNG", () => {
  describe("determinism", () => {
    it("same seed produces same first 100 values", () => {
      const seed = "test-seed";
      const rng1 = new SeededRNG(seed);
      const rng2 = new SeededRNG(seed);
      const seq1: number[] = [];
      const seq2: number[] = [];
      for (let i = 0; i < 100; i++) {
        seq1.push(rng1.next());
        seq2.push(rng2.next());
      }
      expect(seq1).toEqual(seq2);
    });

    it("different seeds produce different sequences", () => {
      const rng1 = new SeededRNG("seed-a");
      const rng2 = new SeededRNG("seed-b");
      const seq1: number[] = [];
      const seq2: number[] = [];
      for (let i = 0; i < 100; i++) {
        seq1.push(rng1.next());
        seq2.push(rng2.next());
      }
      // At least one value should differ in 100 draws
      expect(seq1.some((v, i) => v !== seq2[i])).toBe(true);
    });
  });

  describe("distribution uniformity", () => {
    it("distribution uniform (±10%) over 10k samples", () => {
      const rng = new SeededRNG("distribution-test");
      const buckets = 10;
      const counts = new Array(buckets).fill(0);
      const total = 10_000;
      for (let i = 0; i < total; i++) {
        const v = rng.next();
        counts[v % buckets]++;
      }
      const expected = total / buckets;
      const margin = expected * 0.10;
      for (let b = 0; b < buckets; b++) {
        expect(Math.abs(counts[b] - expected)).toBeLessThanOrEqual(margin);
      }
    });
  });
});
