import { cubeToPixel } from "./coords.js?v=20260418d3";

const HEX_SIZE = 38;
const PADDING = 70;

const TERRAIN_CLASS = {
  PLAINS: "hex-plains",
  HILLS: "hex-hills",
  MOUNTAIN: "hex-mountain",
  WATER: "hex-water",
  FOREST: "hex-hills",
};

function hexPoints(size) {
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([size * Math.cos(angle), size * Math.sin(angle)]);
  }
  return pts;
}

function pointsAttr(points) {
  return points.map((point) => point.join(",")).join(" ");
}

const POLYGON_PTS = hexPoints(HEX_SIZE);
const INNER_RING_PTS = hexPoints(HEX_SIZE - 6);

function computeViewBox(board) {
  if (!board.length) {
    return "-160 -160 320 320";
  }

  const pixels = board.map((cell) => cubeToPixel(cell.coord, HEX_SIZE));
  const xs = pixels.map((point) => point.x);
  const ys = pixels.map((point) => point.y);
  const minX = Math.min(...xs) - PADDING;
  const maxX = Math.max(...xs) + PADDING;
  const minY = Math.min(...ys) - PADDING;
  const maxY = Math.max(...ys) + PADDING;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

export function renderBoard(svgElement, board, state = {}) {
  while (svgElement.firstChild) {
    svgElement.removeChild(svgElement.firstChild);
  }

  svgElement.setAttribute("viewBox", computeViewBox(board));
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  for (const cell of board) {
    const { q, r, s } = cell.coord;
    const { x, y } = cubeToPixel({ q, r, s }, HEX_SIZE);
    const terrain = cell.terrain || "PLAINS";
    const cls = TERRAIN_CLASS[terrain] || "hex-plains";

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
    g.setAttribute("class", "hex-cell");
    if (g.dataset) {
      g.dataset.coord = `${q},${r},${s}`;
      if (cell.control) g.dataset.control = cell.control;
    } else {
      g.setAttribute("data-coord", `${q},${r},${s}`);
      if (cell.control) g.setAttribute("data-control", cell.control);
    }

    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", pointsAttr(POLYGON_PTS));
    poly.setAttribute("class", cls);
    g.appendChild(poly);

    if (cell.control) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      ring.setAttribute("points", pointsAttr(INNER_RING_PTS));
      ring.setAttribute("class", "hex-control-ring");
      if (ring.dataset) ring.dataset.side = cell.control;
      else ring.setAttribute("data-side", cell.control);
      g.appendChild(ring);
    }

    if (q === 0 && r === 0) {
      const centerMark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      centerMark.setAttribute("r", "4");
      centerMark.setAttribute("class", "hex-center-mark");
      g.appendChild(centerMark);
    }

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("class", "board-label");
    label.textContent = `${q},${r}`;
    g.appendChild(label);

    svgElement.appendChild(g);
  }

  if (state.headline) {
    const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
    title.setAttribute("x", "0");
    title.setAttribute("y", "-210");
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "rgba(237,244,255,0.78)");
    title.setAttribute("font-size", "12");
    title.setAttribute("font-family", "Georgia, serif");
    title.textContent = state.phase ?? "Battlefield";
    svgElement.appendChild(title);
  }
}
