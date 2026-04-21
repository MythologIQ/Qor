/**
 * Fog-of-war client overlay.
 * Renders an opaque SVG mask over cells that are not in the visibility set.
 */
import type { CubeCoord } from "../shared/types.ts";

const HEX_SIZE = 28;
const W = Math.sqrt(3) * HEX_SIZE;
const H = 2 * HEX_SIZE;

/**
 * Convert a cube coord to SVG pixel center (pointy-top orientation).
 */
function cubeToPixel(c: CubeCoord): { x: number; y: number } {
  const x = HEX_SIZE * Math.sqrt(3) * (c.q + c.r / 2);
  const y = HEX_SIZE * 1.5 * c.r;
  return { x, y };
}

/**
 * Generate SVG polygon points string for a pointy-top hex at pixel center (cx, cy).
 */
function hexPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * Build an SVG fog mask.
 * Cells NOT in the visibility set receive an opaque overlay (dark fog).
 * Cells in the visibility set are left transparent (visible).
 *
 * @param cells  - all board cells to consider
 * @param visibility - Set of coordinate keys "q,r" for cells the local player can see
 * @returns SVG string with fog polygons over non-visible cells
 */
export function fogMask(cells: { position: CubeCoord }[], visibility: Set<string>): string {
  if (cells.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`;
  }

  const fogCells = cells.filter((c) => !visibility.has(`${c.position.q},${c.position.r}`));

  if (fogCells.length === 0) {
    // No fog — return empty SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`;
  }

  const polygons = fogCells.map((cell) => {
    const { x, y } = cubeToPixel(cell.position);
    const pts = hexPoints(x, y);
    // Dark semi-transparent fog fill
    return `<polygon points="${pts}" fill="#0d1b2a" opacity="0.85" stroke="none"/>`;
  });

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cell of cells) {
    const { x, y } = cubeToPixel(cell.position);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const pad = HEX_SIZE * 1.5;
  const vx = minX - pad;
  const vy = minY - pad;
  const vw = maxX - minX + pad * 2 + W;
  const vh = maxY - minY + pad * 2 + H;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}"`,
    `  width="${vw.toFixed(0)}" height="${vh.toFixed(0)}"`,
    `  style="position:absolute;top:0;left:0;pointer-events:none">`,
    polygons.join("\n"),
    `</svg>`,
  ].join("\n");
}