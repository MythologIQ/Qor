import { describe, it, expect } from "bun:test";
import { cube, distance, neighbors, equals, isValid, axialToCube, cubeToPixel } from "../../src/engine/coords";
import type { CubeCoord } from "../../src/shared/types";

describe("coords.ts", () => {
  describe("cube", () => {
    it("constructs a valid cube coord with q+r+s=0", () => {
      const c = cube(2, -1);
      expect(c.q).toBe(2);
      expect(c.r).toBe(-1);
      expect(c.s).toBe(-1);
    });

    it("normalizes -0 to 0", () => {
      const c = cube(0, 0);
      expect(c.q).toBe(0);
      expect(c.r).toBe(0);
      expect(c.s).toBe(0);
    });
  });

  describe("distance", () => {
    it("distance(0,0,0 → 0,0,0) = 0", () => {
      expect(distance({ q: 0, r: 0, s: 0 }, { q: 0, r: 0, s: 0 })).toBe(0);
    });

    it("distance(0,0,0 → 3,-3,0) = 3", () => {
      expect(distance({ q: 0, r: 0, s: 0 }, { q: 3, r: -3, s: 0 })).toBe(3);
    });

    it("distance(1,2,-3 → 4,1,-5) = 3", () => {
      expect(distance({ q: 1, r: 2, s: -3 }, { q: 4, r: 1, s: -5 })).toBe(3);
    });

    it("distance is symmetric", () => {
      const a: CubeCoord = { q: -2, r: 1, s: 1 };
      const b: CubeCoord = { q: 3, r: -2, s: -1 };
      expect(distance(a, b)).toBe(distance(b, a));
    });
  });

  describe("neighbors", () => {
    it("returns exactly 6 neighbors", () => {
      expect(neighbors({ q: 0, r: 0, s: 0 })).toHaveLength(6);
    });

    it("all neighbors sum to 0 (q+r+s invariant)", () => {
      const origin = { q: 0, r: 0, s: 0 };
      for (const n of neighbors(origin)) {
        expect(n.q + n.r + n.s).toBe(0);
      }
    });

    it("neighbors are distinct", () => {
      const ns = neighbors({ q: 0, r: 0, s: 0 });
      const unique = new Set(ns.map((n) => `${n.q},${n.r},${n.s}`));
      expect(unique.size).toBe(6);
    });
  });

  describe("equals", () => {
    it("same coords are equal", () => {
      expect(equals({ q: 1, r: -2, s: 1 }, { q: 1, r: -2, s: 1 })).toBe(true);
    });

    it("different coords are not equal", () => {
      expect(equals({ q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 })).toBe(false);
    });
  });

  describe("isValid", () => {
    it("origin is valid for any size > 0", () => {
      expect(isValid({ q: 0, r: 0, s: 0 }, 9)).toBe(true);
    });

    it("validates bounds for board size 9", () => {
      expect(isValid({ q: 8, r: -8, s: 0 }, 9)).toBe(true);
      expect(isValid({ q: 9, r: -9, s: 0 }, 9)).toBe(false);
      expect(isValid({ q: -8, r: 8, s: 0 }, 9)).toBe(true);
      expect(isValid({ q: -9, r: 9, s: 0 }, 9)).toBe(false);
    });

    it("negative coords within bounds are valid", () => {
      expect(isValid({ q: -4, r: 2, s: 2 }, 9)).toBe(true);
    });
  });

  describe("axialToCube", () => {
    it("converts axial to cube correctly", () => {
      const c = axialToCube({ q: 3, r: -1 });
      expect(c.q).toBe(3);
      expect(c.r).toBe(-1);
      expect(c.s).toBe(-2);
    });
  });

  describe("cubeToPixel", () => {
    it("origin maps to (0, 0)", () => {
      const p = cubeToPixel({ q: 0, r: 0, s: 0 }, 10);
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    });

    it("positive r shifts y", () => {
      const p = cubeToPixel({ q: 0, r: 1, s: -1 }, 10);
      expect(p.y).toBe(15);
    });
  });
});
