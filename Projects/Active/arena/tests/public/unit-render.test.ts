import { describe, expect, test } from "bun:test";
import { renderUnit, renderUnits, unitCubeToPixel } from "../../src/public/unit-render.ts";

describe("unitCubeToPixel", () => {
  test("center hex at origin", () => {
    const { x, y } = unitCubeToPixel(0, 0);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  test("pointy-top orientation: q axis has sqrt(3) factor", () => {
    const { x: x1 } = unitCubeToPixel(0, 0);
    const { x: x2 } = unitCubeToPixel(1, 0);
    const diff = Math.abs(x2 - x1);
    // sqrt(3) * HEX_SIZE = sqrt(3) * 28 ≈ 48.5
    expect(diff).toBeGreaterThan(40);
    expect(diff).toBeLessThan(55);
  });

  test("r axis contributes to y linearly with 1.5 factor", () => {
    const { y: y1 } = unitCubeToPixel(0, 0);
    const { y: y2 } = unitCubeToPixel(0, 1);
    const diff = Math.abs(y2 - y1);
    expect(diff).toBeCloseTo(42, 0); // 1.5 * 28 = 42
  });

  test("r/2 offset on q axis", () => {
    const { x: x1 } = unitCubeToPixel(0, 0);
    const { x: x2 } = unitCubeToPixel(0, 1);
    // q=0,r=1 → offset = 1/2 * sqrt(3) * 28 ≈ 24.25
    const diff = Math.abs(x2 - x1);
    expect(diff).toBeGreaterThan(20);
    expect(diff).toBeLessThan(30);
  });
});

describe("renderUnit", () => {
  const unitA = {
    id: "u1" as const,
    owner: "A" as const,
    position: { q: 0, r: 0, s: 0 },
    type: "scout" as const,
    health: 100,
  };

  const unitB = {
    id: "u2" as const,
    owner: "B" as const,
    position: { q: 0, r: 0, s: 0 },
    type: "scout" as const,
    health: 100,
  };

  test("produces a circle element", () => {
    const svg = renderUnit(unitA, 100, 100);
    expect(svg).toContain("<circle");
    expect(svg).toContain("/>");
  });

  test("sets cx and cy attributes", () => {
    const svg = renderUnit(unitA, 100, 200);
    expect(svg).toContain('cx="100"');
    expect(svg).toContain('cy="200"');
  });

  test("sets radius of 10", () => {
    const svg = renderUnit(unitA, 0, 0);
    expect(svg).toContain('r="10"');
  });

  test("owner A gets blue fill (#1565c0)", () => {
    const svg = renderUnit(unitA, 0, 0);
    expect(svg).toContain('fill="#1565c0"');
  });

  test("owner B gets red fill (#c62828)", () => {
    const svg = renderUnit(unitB, 0, 0);
    expect(svg).toContain('fill="#c62828"');
  });

  test("includes black stroke", () => {
    const svg = renderUnit(unitA, 0, 0);
    expect(svg).toContain('stroke="#000"');
  });

  test("stroke-width is 1.5", () => {
    const svg = renderUnit(unitA, 0, 0);
    expect(svg).toContain('stroke-width="1.5"');
  });

  test("unknown owner falls back to #888888", () => {
    const unknownUnit = {
      id: "u3" as const,
      owner: "X" as const,
      position: { q: 0, r: 0, s: 0 },
      type: "scout" as const,
      health: 100,
    };
    const svg = renderUnit(unknownUnit, 0, 0);
    expect(svg).toContain('fill="#888888"');
  });
});

describe("renderUnits", () => {
  const unitA = (q: number, r: number) => ({
    id: `uA_${q}_${r}` as const,
    owner: "A" as const,
    position: { q, r, s: -q - r },
    type: "scout" as const,
    health: 100,
  });

  const unitB = (q: number, r: number) => ({
    id: `uB_${q}_${r}` as const,
    owner: "B" as const,
    position: { q, r, s: -q - r },
    type: "scout" as const,
    health: 100,
  });

  test("empty array returns empty string", () => {
    expect(renderUnits([])).toBe("");
  });

  test("wraps output in <g class=\"units\">", () => {
    const svg = renderUnits([unitA(0, 0)]);
    expect(svg).toContain('<g class="units">');
    expect(svg).toContain("</g>");
  });

  test("renders one circle per unit", () => {
    const svg = renderUnits([unitA(0, 0)]);
    const matches = svg.match(/<circle/g);
    expect(matches).toHaveLength(1);
  });

  test("renders two circles for two units", () => {
    const svg = renderUnits([unitA(0, 0), unitB(1, 0)]);
    const matches = svg.match(/<circle/g);
    expect(matches).toHaveLength(2);
  });

  test("units from different owners get different colors", () => {
    const svg = renderUnits([unitA(0, 0), unitB(1, 0)]);
    expect(svg).toContain('fill="#1565c0"');
    expect(svg).toContain('fill="#c62828"');
  });

  test("each unit is positioned at its cube-coordinate pixel center", () => {
    const svg = renderUnits([unitA(0, 0)]);
    expect(svg).toContain('cx="0"');
    expect(svg).toContain('cy="0"');
  });

  test("deterministic: same units produce identical SVG", () => {
    const units = [unitA(0, 0), unitB(1, -1)];
    const svg1 = renderUnits(units);
    const svg2 = renderUnits(units);
    expect(svg1).toBe(svg2);
  });

  test("handles negative cube coordinates", () => {
    const svg = renderUnits([unitA(-2, 1)]);
    expect(svg).toContain('cx="');
    expect(svg).toContain('cy="');
    const matches = svg.match(/cx="([^"]+)"/);
    expect(matches).toBeTruthy();
    const cx = parseFloat(matches![1]);
    expect(cx).toBeLessThan(0);
  });
});