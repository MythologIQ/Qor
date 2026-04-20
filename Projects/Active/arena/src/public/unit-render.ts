/**
 * Unit SVG render helper (client-side TS, no React).
 * Deterministic — same units always produce identical SVG.
 */
import type { Unit } from "../shared/types.ts";

const UNIT_RADIUS = 10;

const OWNER_COLOR: Record<Unit["owner"], string> = {
  A: "#1565c0", // blue
  B: "#c62828", // red
};

/**
 * Render a unit as an SVG circle element.
 * Position is derived from the unit's cube coordinate.
 */
export function renderUnit(unit: Unit, cx: number, cy: number): string {
  const color = OWNER_COLOR[unit.owner] ?? "#888888";
  return `<circle cx="${cx}" cy="${cy}" r="${UNIT_RADIUS}" fill="${color}" stroke="#000" stroke-width="1.5"/>`;
}

/**
 * Convert a cube coord to SVG pixel center (pointy-top orientation).
 * Mirrors the conversion in hex-render.ts for consistency.
 */
export function unitCubeToPixel(q: number, r: number): { x: number; y: number } {
  const HEX_SIZE = 28;
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 1.5 * r;
  return { x, y };
}

/**
 * Render all units as an SVG <g> group.
 * Each unit gets a colored circle at its cube-coordinate pixel center.
 */
export function renderUnits(units: Unit[]): string {
  if (units.length === 0) return "";

  const circles = units.map((unit) => {
    const { x, y } = unitCubeToPixel(unit.position.q, unit.position.r);
    return renderUnit(unit, x, y);
  });

  return `<g class="units">${circles.join("")}</g>`;
}