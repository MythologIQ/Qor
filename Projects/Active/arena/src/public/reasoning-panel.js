export function updateReasoningPanel(el, agents) {
  if (!el) return;
  el.replaceChildren();

  if (!agents || agents.length === 0) {
    el.textContent = "";
    return;
  }

  const entries = agents.filter((agent) => agent.reasoning).reverse();
  entries.forEach(({ side, agentId, reasoning }) => {
    const card = document.createElement("article");
    card.className = "reason-card";
    card.innerHTML = `<span class="reason-label">Side ${side} · ${agentId}</span><p>${reasoning}</p>`;
    el.appendChild(card);
  });
}
