import type { CubeCoord } from "../shared/types.ts";

// Normalize -0 to 0 for consistent serialization
function nz(n: number): number {
  return n === 0 ? 0 : n;
}

// Cube coordinate constructor enforcing q+r+s=0 invariant
export function cube(q: number, r: number): CubeCoord {
  return { q: nz(q), r: nz(r), s: nz(-q - r) };
}

// Cube distance: (|q1-q2| + |r1-r2| + |s1-s2|) / 2
export function distance(a: CubeCoord, b: CubeCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

// 6 cube directions for flat-top hex neighbors
const DIRECTIONS: readonly CubeCoord[] = [
  { q: +1, r: -1, s: 0 },
  { q: +1, r: 0, s: -1 },
  { q: 0, r: +1, s: -1 },
  { q: -1, r: +1, s: 0 },
  { q: -1, r: 0, s: +1 },
  { q: 0, r: -1, s: +1 },
] as const;

// Neighbors of a cube coordinate
export function neighbors(c: CubeCoord): CubeCoord[] {
  return DIRECTIONS.map((d) => ({ q: c.q + d.q, r: c.r + d.r, s: c.s + d.s }));
}

// Structural equality
export function equals(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

// Check if cube coord is within board bounds of given size
export function isValid(c: CubeCoord, size: number): boolean {
  const { q, r, s } = c;
  // Board is菱形 diamond; valid coords satisfy |q| < size, |r| < size, |s| < size
  // and q+r+s must already be 0
  return Math.abs(q) < size && Math.abs(r) < size && Math.abs(s) < size;
}

// Convert axial {q,r} to full cube coord {q,r,s}
export function axialToCube(axial: { q: number; r: number }): CubeCoord {
  return { q: axial.q, r: axial.r, s: -axial.q - axial.r };
}

// Convert cube coord to pixel for flat-top rendering
// size = hex radius in pixels
export function cubeToPixel(c: CubeCoord, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * c.q + (Math.sqrt(3) / 2) * c.r);
  const y = size * ((3 / 2) * c.r);
  return { x, y };
}
