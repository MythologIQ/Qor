export function updateReasoningPanel(el, agents, opts = {}) {
  if (!el) return;
  el.replaceChildren();
  if (!agents || agents.length === 0) return;

  const targetSide = opts.side;
  const agentMeta = opts.agent;
  const entries = agents
    .filter((a) => a.reasoning)
    .filter((a) => !targetSide || a.side === targetSide)
    .reverse();

  entries.forEach(({ side, agentId, reasoning }) => {
    const card = document.createElement("article");
    card.className = "reason-card";
    card.dataset.side = side;
    const avgMs = agentMeta?.totalActions ? Math.round(agentMeta.totalMs / agentMeta.totalActions) : 0;
    const sideLabel = side === "A" ? "Horizon" : "Morrow";
    card.innerHTML = `
      <span class="reason-label">${sideLabel} Intent</span>
      <div class="reason-meta">${agentMeta?.status ?? agentId}${avgMs ? ` · ${avgMs}ms` : ""}</div>
      <p>${reasoning}</p>
    `;
    el.appendChild(card);
  });
}
