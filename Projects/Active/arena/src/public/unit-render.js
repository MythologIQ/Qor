import { cubeToPixel } from "./coords.js?v=20260422b1";

const HEX_SIZE = 48;
const TOKEN_SIZE = 44;

const TOKEN_TYPES = new Set(["scout", "raider", "interceptor", "siege", "captain"]);

function tokenPath(type, owner) {
  if (!TOKEN_TYPES.has(type)) return null;
  const color = owner === "A" ? "Blue" : owner === "B" ? "Red" : null;
  if (!color) return null;
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  return `/arena/static/tokens/${name}-${color}.png?v=20260422b2`;
}

const OWNER_COLOR = {
  A: "#2f78ff",
  B: "#ff4537",
};

const FALLBACK_MARK = {
  recon: "R",
  raider: "Rd",
  interceptor: "I",
  artillery: "A",
  siege: "S",
  scout: "Sc",
  lancer: "L",
  captain: "C",
  heavy: "H",
  infantry: "In",
};

function appendFallbackShell(g, unit) {
  const ns = "http://www.w3.org/2000/svg";
  const r = 16;
  const shell = document.createElementNS(ns, "circle");
  shell.setAttribute("r", String(r));
  shell.setAttribute("class", "unit-shell");
  shell.dataset.side = unit.owner;
  shell.setAttribute("fill", OWNER_COLOR[unit.owner] ?? "#888");
  shell.setAttribute("stroke", "rgba(255,255,255,0.82)");
  shell.setAttribute("stroke-width", "1.6");
  g.appendChild(shell);

  const label = document.createElementNS(ns, "text");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "central");
  label.setAttribute("y", "-1");
  label.setAttribute("class", "unit-type");
  label.textContent = FALLBACK_MARK[unit.type] ?? "?";
  g.appendChild(label);
}

function appendTokenImage(g, href) {
  const ns = "http://www.w3.org/2000/svg";
  const image = document.createElementNS(ns, "image");
  image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  image.setAttribute("href", href);
  image.setAttribute("x", String(-TOKEN_SIZE / 2));
  image.setAttribute("y", String(-TOKEN_SIZE / 2));
  image.setAttribute("width", String(TOKEN_SIZE));
  image.setAttribute("height", String(TOKEN_SIZE));
  image.setAttribute("class", "unit-token-image");
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  g.appendChild(image);
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
    shadow.setAttribute("cy", "18");
    shadow.setAttribute("rx", "16");
    shadow.setAttribute("ry", "5");
    shadow.setAttribute("class", "unit-shadow");
    g.appendChild(shadow);

    const href = tokenPath(unit.type, unit.owner);
    if (href) {
      appendTokenImage(g, href);
    } else {
      appendFallbackShell(g, unit);
    }

    const hpBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hpBg.setAttribute("x", "-8");
    hpBg.setAttribute("y", "12");
    hpBg.setAttribute("width", "16");
    hpBg.setAttribute("height", "5");
    hpBg.setAttribute("rx", "2");
    hpBg.setAttribute("fill", "rgba(0,0,0,0.6)");
    g.appendChild(hpBg);

    const hpBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const maxHp = 10;
    const hpPct = Math.min(1, Math.max(0, unit.hp / maxHp));
    hpBar.setAttribute("x", "-7");
    hpBar.setAttribute("y", "13");
    hpBar.setAttribute("width", String(Math.round(14 * hpPct)));
    hpBar.setAttribute("height", "3");
    hpBar.setAttribute("rx", "1.5");
    hpBar.setAttribute("fill", "#4cff88");
    g.appendChild(hpBar);

    svgElement.appendChild(g);
  }
}
