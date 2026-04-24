const SIDE_LABEL = { A: "Horizon", B: "Morrow" };

function applyBubble(el, side, reasoningEntry, agent) {
  if (!el) return;
  const nameEl = el.querySelector(".bubble-name");
  const textEl = el.querySelector(".bubble-text");
  if (nameEl) nameEl.textContent = agent?.operator || SIDE_LABEL[side] || side;
  const text = reasoningEntry?.reasoning?.trim();
  if (textEl) textEl.textContent = text && text.length > 0 ? text : "Holding line…";
  const isActing = (agent?.status ?? "").toLowerCase() === "acting";
  el.dataset.state = isActing ? "acting" : "idle";
}

export function updateAgentBubbles(bubbleAEl, bubbleBEl, reasoning, agents) {
  const reasoningA = reasoning.find((r) => r.side === "A");
  const reasoningB = reasoning.find((r) => r.side === "B");
  const agentA = agents.find((a) => a.side === "A");
  const agentB = agents.find((a) => a.side === "B");
  applyBubble(bubbleAEl, "A", reasoningA, agentA);
  applyBubble(bubbleBEl, "B", reasoningB, agentB);
}
