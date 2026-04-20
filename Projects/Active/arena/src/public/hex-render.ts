/**
 * Hex board SVG render helper (client-side TS, no React).
 * Deterministic — same cells always produce identical SVG.
 */
import type { CubeCoord, HexCell } from "../shared/types.ts";

/** Pointy-top hex tile; size = center-to-vertex distance in pixels. */
const HEX_SIZE = 28;

/** Flat-top to flat-top width = sqrt(3) * size. */
const W = Math.sqrt(3) * HEX_SIZE;
/** Pointy-top to pointy-top height = 2 * size. */
const H = 2 * HEX_SIZE;

/**
 * Convert a cube coord to SVG pixel center (pointy-top orientation).
 * Uses the standard cube→axial conversion: axial q,r map directly.
 */
function cubeToPixel(c: CubeCoord): { x: number; y: number } {
  const x = HEX_SIZE * Math.sqrt(3) * (c.q + c.r / 2);
  const y = HEX_SIZE * 1.5 * c.r;
  return { x, y };
}

/**
 * Generate SVG polygon points string for a pointy-top hex at pixel center (cx, cy).
 * Returns a 6-tuple of space-separated "x,y" vertex pairs.
 */
function hexPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top: start at -30°
    pts.push(`${(cx + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** SVG fill color per terrain type. */
const TERRAIN_COLOR: Record<HexCell["terrain"], string> = {
  plain: "#c8e6c9",
  forest: "#2e7d32",
  mountain: "#78909c",
  water: "#42a5f5",
};

/**
 * Build a full SVG board string for the given cells.
 * Cells with no terrain default to plain. Units are rendered as colored circles.
 * Board viewBox auto-expands to fit all cells with small margin.
 */
export function renderHex(cells: HexCell[]): string {
  if (cells.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`;
  }

  const rendered = cells.map((cell) => {
    const { x, y } = cubeToPixel(cell.position);
    const pts = hexPoints(x, y);
    const fill = TERRAIN_COLOR[cell.terrain] ?? TERRAIN_COLOR.plain;
    let extra = "";

    if (cell.unit) {
      const cx = x.toFixed(2);
      const cy = y.toFixed(2);
      const color = cell.unit.owner === "A" ? "#1565c0" : "#b71c1c";
      extra += `<circle cx="${cx}" cy="${cy}" r="9" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
      extra += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="8" fill="#fff" font-family="monospace">${cell.unit.strength}</text>`;
    }

    return `<polygon points="${pts}" fill="${fill}" stroke="#37474f" stroke-width="1" opacity="0.9"/>\n${extra}`;
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
    `  style="background:#1a237e">`,
    rendered.join("\n"),
    `</svg>`,
  ].join("\n");
}