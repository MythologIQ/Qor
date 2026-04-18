import { cubeToPixel } from "../engine/coords.ts";

const HEX_SIZE = 32;

// Owner color map
const OWNER_COLOR = {
  A: "#3b82f6", // blue
  B: "#ef4444", // red
};

// Ease-in duration in ms (KISS: short enough to feel responsive)
const MOVE_DURATION_MS = 150;

/**
 * Render units onto an SVG board element with ease-in animations.
 * @param {SVGSVGElement} svgElement
 * @param {Array<{id: string, owner: "A"|"B", position: {q,r,s}, strength: number, hp: number, type: string}>} units
 */
export function renderUnits(svgElement, units) {
  // Collect existing unit elements by id for move detection
  const existing = new Map();
  svgElement.querySelectorAll('[data-unit-id]').forEach(el => {
    existing.set(el.getAttribute('data-unit-id'), el);
  });

  const currentPositions = new Map();

  for (const unit of units) {
    const { q, r, s } = unit.position;
    const { x, y } = cubeToPixel({ q, r, s }, HEX_SIZE);
    const color = OWNER_COLOR[unit.owner] || "#888";
    const key = unit.id;

    let g = existing.get(key);
    const isNew = !g;

    if (isNew) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-unit-id", key);
      g.style.transition = `transform ${MOVE_DURATION_MS}ms ease-in`;

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "10");
      circle.setAttribute("fill", color);
      circle.setAttribute("stroke", "#fff");
      circle.setAttribute("stroke-width", "1.5");
      g.appendChild(circle);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      label.setAttribute("font-size", "7");
      label.setAttribute("fill", "#fff");
      label.setAttribute("font-weight", "bold");
      label.textContent = `${unit.hp}/${unit.strength}`;
      g.appendChild(label);

      svgElement.appendChild(g);
    } else {
      existing.delete(key);
    }

    currentPositions.set(key, { x, y, g });

    // Set initial position immediately (no animation on first render)
    if (isNew) {
      g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
    }
  }

  // Animate existing units to new positions
  for (const [key, { x, y, g }] of currentPositions) {
    g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
  }

  // Remove units no longer present
  for (const [key, el] of existing) {
    el.remove();
  }
}