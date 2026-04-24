import { UNIT_CATALOG } from "./unit-catalog.js?v=20260422r1";

const STAT_ICON = {
  hp: "HP",
  str: "STR",
  range: "RNG",
  move: "MOV",
};

function statCell(label, value) {
  return `
    <div class="stat-cell">
      <span class="stat-cell-label">${label}</span>
      <strong class="stat-cell-value">${value}</strong>
    </div>
  `;
}

function buildCardHtml(unit) {
  const terrainList = unit.terrain
    .map((line) => `<li>${line}</li>`)
    .join("");
  return `
    <div class="stat-card-head">
      <img class="stat-card-token" src="${unit.token}" alt="${unit.name} token" />
      <div class="stat-card-title">
        <strong>${unit.name}</strong>
        <em>${unit.tagline}</em>
      </div>
    </div>
    <div class="stat-card-grid">
      ${statCell(STAT_ICON.hp, unit.stats.hp)}
      ${statCell(STAT_ICON.str, unit.stats.str)}
      ${statCell(STAT_ICON.range, unit.stats.range)}
      ${statCell(STAT_ICON.move, unit.stats.move)}
    </div>
    <dl class="stat-card-rows">
      <div><dt>Movement</dt><dd>${unit.movement.type} · ${unit.movement.speed}</dd></div>
      <div><dt>Terrain</dt><dd><ul class="stat-card-list">${terrainList}</ul></dd></div>
      <div><dt>Ability</dt><dd><strong>${unit.ability.name}</strong><span>${unit.ability.description}</span></dd></div>
    </dl>
  `;
}

function placeTooltip(tooltip, anchor) {
  const margin = 12;
  tooltip.style.visibility = "hidden";
  tooltip.hidden = false;
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = anchorRect.top - tipRect.height - margin;
  let placement = "top";
  if (top < margin) {
    top = anchorRect.bottom + margin;
    placement = "bottom";
  }

  let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, vw - tipRect.width - margin));
  if (top + tipRect.height > vh - margin) {
    top = Math.max(margin, vh - tipRect.height - margin);
  }

  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.dataset.placement = placement;
  tooltip.style.visibility = "";
}

export function mountUnitRoster(rosterEl) {
  if (!rosterEl) return;
  rosterEl.innerHTML = "";
  const label = document.createElement("span");
  label.className = "unit-roster-label";
  label.textContent = "Unit Roster";
  rosterEl.appendChild(label);

  for (const unit of UNIT_CATALOG) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "roster-item";
    item.dataset.unitId = unit.id;
    item.setAttribute("aria-label", `${unit.name} stats`);
    item.innerHTML = `
      <img class="roster-token" src="${unit.token}" alt="" />
      <span class="roster-name">${unit.name}</span>
    `;
    rosterEl.appendChild(item);
  }

  const tooltip = document.createElement("div");
  tooltip.className = "stat-card-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  let activeAnchor = null;
  let hideTimer = null;

  function show(anchor) {
    const unitId = anchor.dataset.unitId;
    const unit = UNIT_CATALOG.find((u) => u.id === unitId);
    if (!unit) return;
    clearTimeout(hideTimer);
    activeAnchor = anchor;
    tooltip.innerHTML = buildCardHtml(unit);
    placeTooltip(tooltip, anchor);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      tooltip.hidden = true;
      activeAnchor = null;
    }, 80);
  }

  function immediateHide() {
    clearTimeout(hideTimer);
    tooltip.hidden = true;
    activeAnchor = null;
  }

  rosterEl.querySelectorAll(".roster-item").forEach((anchor) => {
    anchor.addEventListener("pointerenter", () => show(anchor));
    anchor.addEventListener("pointerleave", scheduleHide);
    anchor.addEventListener("focus", () => show(anchor));
    anchor.addEventListener("blur", scheduleHide);
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      if (activeAnchor === anchor) {
        immediateHide();
      } else {
        show(anchor);
      }
    });
  });

  tooltip.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  tooltip.addEventListener("pointerleave", scheduleHide);

  window.addEventListener("scroll", immediateHide, true);
  window.addEventListener("resize", immediateHide);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") immediateHide();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!activeAnchor) return;
    const target = event.target;
    if (target instanceof Node && (activeAnchor.contains(target) || tooltip.contains(target))) return;
    immediateHide();
  });
}
