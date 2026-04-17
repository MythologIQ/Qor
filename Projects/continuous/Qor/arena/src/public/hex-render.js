import { cubeToPixel } from "../engine/coords.ts";

const HEX_SIZE = 32;
const SQRT3 = Math.sqrt(3);

// Terrain class map
const TERRAIN_CLASS = {
  PLAINS: "hex-plains",
  HILLS: "hex-hills",
  MOUNTAIN: "hex-mountain",
  WATER: "hex-water",
};

// Flat-top hex polygon points for given size
function hexPoints(size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([
      size * Math.cos(angle),
      size * Math.sin(angle),
    ]);
  }
  return pts;
}

// Build SVG polygon points string from offset vertex list
function pointsAttr(pts) {
  return pts.map((p) => p.join(",")).join(" ");
}

const POLYGON_PTS = hexPoints(HEX_SIZE);

/**
 * Render the board into an SVG element.
 * @param {SVGSVGElement} svgElement
 * @param {Array<{coord: {q,r,s}, terrain?: string}>} board
 */
export function renderBoard(svgElement, board) {
  // Clear previous render
  while (svgElement.firstChild) {
    svgElement.removeChild(svgElement.firstChild);
  }

  // Establish SVG viewBox
  svgElement.setAttribute("viewBox", "-160 -160 320 320");
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  for (const cell of board) {
    const { q, r, s } = cell.coord;
    const { x, y } = cubeToPixel({ q, r, s }, HEX_SIZE);
    const terrain = cell.terrain || "PLAINS";
    const cls = TERRAIN_CLASS[terrain] || "hex-plains";

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);

    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", pointsAttr(POLYGON_PTS));
    poly.setAttribute("class", cls);
    g.appendChild(poly);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("font-size", "5");
    label.setAttribute("fill", "#333");
    label.textContent = `${q},${r}`;
    g.appendChild(label);

    svgElement.appendChild(g);
  }
}
