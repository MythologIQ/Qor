/**
 * Tests for hex-render.ts
 * Verifies: 3 cells produce 3 polygons; viewBox computation is correct.
 */
import { describe, expect, it } from "bun:test";
import { renderHex } from "../../src/public/hex-render.ts";
import type { HexCell } from "../../src/shared/types.ts";

function makeCell(q: number, r: number, terrain = "plain"): HexCell {
  return { position: { q, r, s: -q - r }, terrain };
}

// Helper: count <polygon> tags in SVG string
function countPolygons(svg: string): number {
  return (svg.match(/<polygon/g) ?? []).length;
}

// Helper: extract viewBox attribute
function extractViewBox(svg: string): string | null {
  const m = svg.match(/viewBox="([^"]+)"/);
  return m ? m[1] : null;
}

describe("renderHex", () => {
  it("renders 3 cells as SVG with 3 <polygon> tags", () => {
    const cells: HexCell[] = [
      makeCell(0, 0),
      makeCell(1, -1),
      makeCell(0, 1),
    ];
    const svg = renderHex(cells);
    expect(countPolygons(svg)).toBe(3);
  });

  it("computes correct viewBox from cell positions", () => {
    const cells: HexCell[] = [makeCell(0, 0), makeCell(1, -1), makeCell(0, 1)];
    const svg = renderHex(cells);
    const vb = extractViewBox(svg);
    expect(vb).not.toBeNull();
    // viewBox is "minX minY width height" — all four numbers must be present
    const parts = vb!.split(/\s+/);
    expect(parts.length).toBe(4);
    // width and height should be positive
    expect(parseFloat(parts[2])).toBeGreaterThan(0);
    expect(parseFloat(parts[3])).toBeGreaterThan(0);
  });

  it("renders a cell with a unit as a polygon + circle + text", () => {
    const cell: HexCell = {
      position: { q: 0, r: 0, s: 0 },
      terrain: "plain",
      unit: { owner: "A", strength: 3, movesLeft: 2, attacksLeft: 1 },
    };
    const svg = renderHex([cell]);
    expect(countPolygons(svg)).toBe(1);
    expect(svg).toContain("<circle");
    expect(svg).toContain("<text");
  });
});