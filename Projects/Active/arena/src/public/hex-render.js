import { cubeToPixel } from "./coords.js?v=20260422b1";

const HEX_SIZE = 48;
const PADDING = 40;

const TERRAIN_STYLE = {
  PLAINS: { cls: "hex-plains" },
  HILLS: { cls: "hex-hills" },
  MOUNTAIN: { cls: "hex-mountain" },
  WATER: { cls: "hex-water" },
  FOREST: { cls: "hex-forest" },
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
  return points.map((p) => p.join(",")).join(" ");
}

const POLYGON_PTS = hexPoints(HEX_SIZE);
const INNER_RING_PTS = hexPoints(HEX_SIZE - 6);
const CONTOUR_OUTER_PTS = hexPoints(HEX_SIZE - 4);
const CONTOUR_INNER_PTS = hexPoints(HEX_SIZE - 12);
const MOUNTAIN_PEAK_PTS = hexPoints(HEX_SIZE - 20);

function computeViewBox(board) {
  if (!board.length) return "-160 -160 320 320";
  const pixels = board.map((c) => cubeToPixel(c.coord, HEX_SIZE));
  const xs = pixels.map((p) => p.x);
  const ys = pixels.map((p) => p.y);
  return `${Math.min(...xs) - PADDING} ${Math.min(...ys) - PADDING} ${Math.max(...xs) - Math.min(...xs) + PADDING * 2} ${Math.max(...ys) - Math.min(...ys) + PADDING * 2}`;
}

function makeEl(name, attrs = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function renderTerrainDetails(g, terrain) {
  if (terrain === "HILLS") {
    g.appendChild(makeEl("polygon", {
      points: pointsAttr(CONTOUR_OUTER_PTS),
      fill: "none",
      stroke: "rgba(255,255,255,0.11)",
      "stroke-width": "0.7",
    }));
    g.appendChild(makeEl("polygon", {
      points: pointsAttr(CONTOUR_INNER_PTS),
      fill: "none",
      stroke: "rgba(255,255,255,0.08)",
      "stroke-width": "0.55",
      "stroke-dasharray": "2,2",
    }));
    return;
  }

  if (terrain === "MOUNTAIN") {
    g.appendChild(makeEl("polygon", {
      points: pointsAttr(CONTOUR_OUTER_PTS),
      fill: "none",
      stroke: "rgba(255,255,255,0.14)",
      "stroke-width": "0.8",
    }));
    g.appendChild(makeEl("polygon", {
      points: pointsAttr(CONTOUR_INNER_PTS),
      fill: "none",
      stroke: "rgba(255,255,255,0.1)",
      "stroke-width": "0.6",
    }));
    g.appendChild(makeEl("polygon", {
      points: pointsAttr(MOUNTAIN_PEAK_PTS),
      fill: "rgba(255,220,170,0.08)",
      stroke: "rgba(255,220,170,0.22)",
      "stroke-width": "0.55",
    }));
    g.appendChild(makeEl("path", {
      d: "M -10 6 L 0 -12 L 10 6",
      fill: "none",
      stroke: "rgba(255,225,180,0.32)",
      "stroke-width": "0.9",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
    return;
  }

  if (terrain === "WATER") {
    for (let i = 0; i < 3; i += 1) {
      const y = -14 + i * 12;
      g.appendChild(makeEl("path", {
        d: `M -22 ${y} q 5.5 -3 11 0 t 11 0 t 11 0`,
        fill: "none",
        stroke: "rgba(170,210,255,0.22)",
        "stroke-width": "0.7",
        "stroke-linecap": "round",
      }));
    }
    return;
  }

  if (terrain === "FOREST") {
    const stipple = [
      [-14, -10], [-4, -14], [8, -12],
      [-16, 2], [-2, 0], [12, -2],
      [-10, 12], [4, 10], [14, 14],
    ];
    for (const [cx, cy] of stipple) {
      g.appendChild(makeEl("circle", {
        cx, cy, r: "1.6",
        fill: "rgba(160,220,170,0.18)",
      }));
    }
  }
}

export function renderBoard(svgElement, board, state = {}) {
  while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);
  svgElement.setAttribute("viewBox", computeViewBox(board));
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  for (const cell of board) {
    const { q, r, s } = cell.coord;
    const { x, y } = cubeToPixel({ q, r, s }, HEX_SIZE);
    const terrain = cell.terrain || "PLAINS";
    const style = TERRAIN_STYLE[terrain] ?? TERRAIN_STYLE.PLAINS;

    const g = makeEl("g", {
      transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`,
      class: "hex-cell",
    });
    if (g.dataset) {
      g.dataset.coord = `${q},${r},${s}`;
      g.dataset.terrain = terrain;
      if (cell.control) g.dataset.control = cell.control;
    }

    g.appendChild(makeEl("polygon", {
      points: pointsAttr(POLYGON_PTS),
      class: style.cls,
    }));

    renderTerrainDetails(g, terrain);

    if (cell.control) {
      const ring = makeEl("polygon", {
        points: pointsAttr(INNER_RING_PTS),
        class: "hex-control-ring",
      });
      if (ring.dataset) ring.dataset.side = cell.control;
      g.appendChild(ring);
    } else {
      g.appendChild(makeEl("polygon", {
        points: pointsAttr(POLYGON_PTS),
        fill: "rgba(4,10,18,0.2)",
        stroke: "none",
        "pointer-events": "none",
      }));
    }

    if (q === 0 && r === 0) {
      g.appendChild(makeEl("circle", { r: "4", class: "hex-center-mark" }));
    }

    g.appendChild(Object.assign(makeEl("text", {
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      class: "board-label",
      y: "18",
    }), { textContent: `${q},${r}` }));

    svgElement.appendChild(g);
  }
}
