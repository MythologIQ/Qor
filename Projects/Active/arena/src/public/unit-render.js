import { cubeToPixel } from "./coords.js?v=20260418d3";

const HEX_SIZE = 38;
const TOKEN_RADIUS = 14;

const OWNER_COLOR = {
  A: "#2f78ff",
  B: "#ff4537",
};

function typeMark(type) {
  const map = {
    scout: "S",
    lancer: "L",
    captain: "C",
    heavy: "H",
    infantry: "I",
  };
  return map[type] ?? "U";
}

export function renderUnits(svgElement, units) {
  svgElement.querySelectorAll('[data-unit-id]').forEach((el) => el.remove());

  for (const unit of units) {
    const { q, r, s } = unit.position;
    const { x, y } = cubeToPixel({ q, r, s }, HEX_SIZE);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
    g.setAttribute("data-unit-id", unit.id);
    g.setAttribute("class", "unit-token");

    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    shadow.setAttribute("cx", "0");
    shadow.setAttribute("cy", "13");
    shadow.setAttribute("rx", "13");
    shadow.setAttribute("ry", "5");
    shadow.setAttribute("class", "unit-shadow");
    g.appendChild(shadow);

    const shell = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    shell.setAttribute("r", String(TOKEN_RADIUS));
    shell.setAttribute("class", "unit-shell");
    shell.dataset.side = unit.owner;
    shell.setAttribute("fill", OWNER_COLOR[unit.owner] ?? "#888");
    g.appendChild(shell);

    const typeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    typeLabel.setAttribute("text-anchor", "middle");
    typeLabel.setAttribute("y", "-1");
    typeLabel.setAttribute("class", "unit-type");
    typeLabel.textContent = typeMark(unit.type);
    g.appendChild(typeLabel);

    const hpLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    hpLabel.setAttribute("text-anchor", "middle");
    hpLabel.setAttribute("y", "10");
    hpLabel.setAttribute("class", "unit-hp");
    hpLabel.textContent = `${unit.hp}`;
    g.appendChild(hpLabel);

    svgElement.appendChild(g);
  }
}
