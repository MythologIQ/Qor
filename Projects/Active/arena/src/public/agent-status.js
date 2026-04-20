export function updateAgentStatus(el, sessions) {
  if (!el) return;
  el.replaceChildren();

  if (!sessions || sessions.length === 0) {
    el.textContent = "";
    return;
  }

  sessions.forEach((session) => {
    const avgMs = session.totalActions > 0 ? Math.round(session.totalMs / session.totalActions) : 0;

    const card = document.createElement("article");
    card.className = "agent-card";
    card.dataset.side = session.side;

    const head = document.createElement("div");
    head.className = "agent-head";
    head.innerHTML = `<strong class="agent-name">${session.operator ?? session.id}</strong><span>Side ${session.side}</span>`;

    const meta = document.createElement("div");
    meta.className = "agent-meta";
    meta.innerHTML = `<span class="agent-model">${session.modelId ?? "unknown model"}</span><span class="agent-status-copy">${session.status}</span>`;

    const metrics = document.createElement("div");
    metrics.className = "agent-metrics";
    metrics.innerHTML = [
      `<div class="agent-metric"><span>Avg Decision</span><strong>${avgMs}ms</strong></div>`,
      `<div class="agent-metric"><span>Actions</span><strong>${session.totalActions ?? 0}</strong></div>`,
      `<div class="agent-metric"><span>Invalid</span><strong>${session.invalidCount ?? 0}</strong></div>`,
    ].join("");

    card.append(head, meta, metrics);
    el.appendChild(card);
  });
}
