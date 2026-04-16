import { describe, it, expect } from "bun:test";
import {
  cube,
  distance,
  neighbors,
  equals,
  isValid,
  axialToCube,
  cubeToPixel,
} from "../../src/engine/coords.ts";

describe("cube", () => {
  it("creates cube coord with q+r+s=0", () => {
    const c = cube(2, -3);
    expect(c).toEqual({ q: 2, r: -3, s: 1 });
    expect(c.q + c.r + c.s).toBe(0);
  });

  it("handles zero case", () => {
    const c = cube(0, 0);
    expect(c.q).toBe(0);
    expect(c.r).toBe(0);
    expect(c.s).toBe(0);
    expect(c.q + c.r + c.s).toBe(0);
  });
});

describe("distance", () => {
  it("returns 0 for same coord", () => {
    expect(distance({ q: 0, r: 0, s: 0 }, { q: 0, r: 0, s: 0 })).toBe(0);
  });

  it("returns 1 for neighbors", () => {
    const c = { q: 0, r: 0, s: 0 };
    const n = { q: 1, r: -1, s: 0 };
    expect(distance(c, n)).toBe(1);
  });

  it("returns correct distance for multi-step", () => {
    expect(distance({ q: 0, r: 0, s: 0 }, { q: 2, r: -1, s: -1 })).toBe(2);
  });

  it("is symmetric", () => {
    const a = { q: 1, r: 2, s: -3 };
    const b = { q: -2, r: 1, s: 1 };
    expect(distance(a, b)).toBe(distance(b, a));
  });
});

describe("neighbors", () => {
  it("returns exactly 6 neighbors", () => {
    const n = neighbors({ q: 0, r: 0, s: 0 });
    expect(n).toHaveLength(6);
  });

  it("all neighbors are distance 1 from center", () => {
    const c = { q: 0, r: 0, s: 0 };
    for (const n of neighbors(c)) {
      expect(distance(c, n)).toBe(1);
    }
  });

  it("each neighbor has q+r+s=0", () => {
    const c = { q: 3, r: -1, s: -2 };
    for (const n of neighbors(c)) {
      expect(n.q + n.r + n.s).toBe(0);
    }
  });
});

describe("equals", () => {
  it("returns true for identical coords", () => {
    expect(equals({ q: 1, r: -2, s: 1 }, { q: 1, r: -2, s: 1 })).toBe(true);
  });

  it("returns false for different coords", () => {
    expect(equals({ q: 0, r: 0, s: 0 }, { q: 1, r: -1, s: 0 })).toBe(false);
  });
});

describe("isValid", () => {
  it("returns true for origin within size 9", () => {
    expect(isValid({ q: 0, r: 0, s: 0 }, 9)).toBe(true);
  });

  it("returns true for edge of size 9", () => {
    expect(isValid({ q: 8, r: -8, s: 0 }, 9)).toBe(true);
  });

  it("returns false for out of bounds", () => {
    expect(isValid({ q: 9, r: -9, s: 0 }, 9)).toBe(false);
  });

  it("returns false for negative out of bounds", () => {
    expect(isValid({ q: -9, r: 9, s: 0 }, 9)).toBe(false);
  });
});

describe("axialToCube", () => {
  it("converts axial to cube", () => {
    const c = axialToCube({ q: 3, r: -5 });
    expect(c).toEqual({ q: 3, r: -5, s: 2 });
    expect(c.q + c.r + c.s).toBe(0);
  });

  it("is inverse of cube extraction", () => {
    const original = { q: 2, r: -3 };
    const c = axialToCube(original);
    expect(c.q).toBe(original.q);
    expect(c.r).toBe(original.r);
  });
});

describe("cubeToPixel", () => {
  it("returns origin at (0,0)", () => {
    const p = cubeToPixel({ q: 0, r: 0, s: 0 }, 10);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it("q-axis goes diagonally (sqrt3, 0)", () => {
    const p = cubeToPixel({ q: 1, r: 0, s: -1 }, 10);
    expect(p.x).toBeCloseTo(10 * Math.sqrt(3), 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it("r-axis goes diagonally (sqrt3/2, 3/2)", () => {
    const p = cubeToPixel({ q: 0, r: 1, s: -1 }, 10);
    expect(p.x).toBeCloseTo(10 * Math.sqrt(3) / 2, 5);
    expect(p.y).toBeCloseTo(10 * 1.5, 5);
  });

  it("scales with size parameter", () => {
    const p1 = cubeToPixel({ q: 1, r: 0, s: -1 }, 10);
    const p2 = cubeToPixel({ q: 1, r: 0, s: -1 }, 20);
    expect(p2.x).toBeCloseTo(p1.x * 2, 5);
    expect(p2.y).toBeCloseTo(p1.y * 2, 5);
  });
});
