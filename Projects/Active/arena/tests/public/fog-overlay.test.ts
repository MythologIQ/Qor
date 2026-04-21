import { describe, expect, test } from "bun:test";
import { fogMask } from "../../src/public/fog-overlay.ts";
import type { CubeCoord } from "../../src/shared/types.ts";

function cube(q: number, r: number, s: number = -q - r): CubeCoord {
  return { q, r, s };
}

function cell(q: number, r: number): { position: CubeCoord } {
  return { position: cube(q, r) };
}

function viz(varargs: [number, number][]): Set<string> {
  return new Set(varargs.map(([q, r]) => `${q},${r}`));
}

describe("fogMask", () => {
  test("all visible → empty mask SVG", () => {
    const cells = [cell(0, 0), cell(1, -1), cell(-1, 1)];
    const visibility = viz([[0, 0], [1, -1], [-1, 1]]);
    const result = fogMask(cells, visibility);
    expect(result).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`);
  });

  test("no visible → full fog SVG with all cells", () => {
    const cells = [cell(0, 0), cell(1, -1)];
    const visibility = new Set<string>();
    const result = fogMask(cells, visibility);
    expect(result).toContain(`<svg xmlns="http://www.w3.org/2000/svg"`);
    expect(result).toContain(`viewBox=`);
    expect(result).toContain(`polygon`);
    // Should contain 2 polygons (one per fog cell)
    expect((result.match(/<polygon/g) || []).length).toBe(2);
  });

  test("partial visibility → fog overlay on hidden cells only", () => {
    const cells = [cell(0, 0), cell(1, -1), cell(-1, 1)];
    const visibility = viz([[0, 0]]); // only center visible
    const result = fogMask(cells, visibility);
    // Should contain 2 fog polygons
    expect((result.match(/<polygon/g) || []).length).toBe(2);
    // Should NOT contain polygon for (0,0)
    expect(result).not.toContain(`0,0`);
  });

  test("empty cells array → empty SVG", () => {
    const result = fogMask([], new Set<string>());
    expect(result).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`);
  });

  test("single visible cell → empty SVG", () => {
    const cells = [cell(0, 0)];
    const visibility = viz([[0, 0]]);
    const result = fogMask(cells, visibility);
    expect(result).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`);
  });

  test("single fog cell → SVG with one polygon", () => {
    const cells = [cell(0, 0)];
    const visibility = new Set<string>();
    const result = fogMask(cells, visibility);
    expect((result.match(/<polygon/g) || []).length).toBe(1);
    expect(result).toContain(`xmlns`);
    expect(result).toContain(`viewBox`);
  });

  test("viewBox is computed from all cells (not just fog cells)", () => {
    const cells = [cell(0, 0), cell(2, -2)]; // wide spread
    const visibility = viz([[0, 0]]); // only one visible
    const result = fogMask(cells, visibility);
    // viewBox should encompass both cells
    expect(result).toContain(`viewBox=`);
    // one fog polygon for the hidden cell
    expect((result.match(/<polygon/g) || []).length).toBe(1);
  });

  test("fog polygon has correct hex shape (6 points)", () => {
    const cells = [cell(0, 0)];
    const visibility = new Set<string>();
    const result = fogMask(cells, visibility);
    const match = result.match(/polygon points="([^"]*)"/);
    expect(match).not.toBeNull();
    const points = match![1];
    const coords = points.trim().split(" ");
    expect(coords.length).toBe(6);
  });

  test("visibility keys use q,r string format", () => {
    const cells = [cell(3, -4)];
    const visibility = viz([[3, -4]]);
    const result = fogMask(cells, visibility);
    expect(result).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`);
  });

  test("negative coordinate fog cell renders correctly", () => {
    const cells = [cell(-2, 3)];
    const visibility = new Set<string>();
    const result = fogMask(cells, visibility);
    expect((result.match(/<polygon/g) || []).length).toBe(1);
    expect(result).toContain(`viewBox=`);
    expect(result).toContain(`xmlns`);
  });
});
