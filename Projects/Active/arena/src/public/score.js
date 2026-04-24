export function updateScore(el, { a, b, turn, roundCap, phase, agents = [], units = [] }) {
  if (!el) return;
  el.replaceChildren();

  const actionsA = agents.find((agent) => agent.side === "A")?.totalActions ?? 0;
  const actionsB = agents.find((agent) => agent.side === "B")?.totalActions ?? 0;
  const avgA = (() => {
    const agent = agents.find((item) => item.side === "A");
    return agent?.totalActions ? Math.round(agent.totalMs / agent.totalActions) : 0;
  })();
  const avgB = (() => {
    const agent = agents.find((item) => item.side === "B");
    return agent?.totalActions ? Math.round(agent.totalMs / agent.totalActions) : 0;
  })();
  const unitsA = units.filter((unit) => unit.owner === "A").length;
  const unitsB = units.filter((unit) => unit.owner === "B").length;

  const rows = [
    ["Territory", a, b],
    ["Total Actions", actionsA, actionsB],
    ["Avg Think", `${avgA}ms`, `${avgB}ms`],
    ["Units Alive", unitsA, unitsB],
  ];

  rows.forEach(([label, left, right]) => {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <span class="score-label">${label}</span>
      <strong class="score-value score-value-a">${left}</strong>
      <strong class="score-value score-value-b">${right}</strong>
    `;
    el.appendChild(row);
  });

  const footer = document.createElement("div");
  footer.className = "score-footer";
  footer.innerHTML = `<span>${phase}</span><span>Round ${turn}/${roundCap}</span>`;
  el.appendChild(footer);
}
