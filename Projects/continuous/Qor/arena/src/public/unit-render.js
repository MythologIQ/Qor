import { cubeToPixel } from "../engine/coords.ts";

const HEX_SIZE = 32;

// Owner color map
const OWNER_COLOR = {
  A: "#3b82f6", // blue
  B: "#ef4444", // red
};

/**
 * Render units onto an SVG board element.
 * @param {SVGSVGElement} svgElement
 * @param {Array<{id: string, owner: "A"|"B", position: {q,r,s}, strength: number, hp: number, type: string}>} units
 */
export function renderUnits(svgElement, units) {
  for (const unit of units) {
    const { q, r, s } = unit.position;
    const { x, y } = cubeToPixel({ q, r, s }, HEX_SIZE);
    const color = OWNER_COLOR[unit.owner] || "#888";

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);

    // Circle with owner color
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", "10");
    circle.setAttribute("fill", color);
    circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "1.5");
    g.appendChild(circle);

    // HP / strength label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("font-size", "7");
    label.setAttribute("fill", "#fff");
    label.setAttribute("font-weight", "bold");
    label.textContent = `${unit.hp}/${unit.strength}`;
    g.appendChild(label);

    svgElement.appendChild(g);
  }
}