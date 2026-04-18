/**
 * reasoning-panel.js — HexaWars Agent Reasoning Display
 * Displays metadata.reasoning from the most recent ACTION frame per agent.
 * Styled to sit alongside the agent-status bar; hidden when no reasoning available.
 */

/**
 * @param {HTMLElement} el
 * @param {Array<{ agentId: string, side: string, reasoning?: string }>} agents
 */
export function updateReasoningPanel(el, agents) {
  if (!el) return;
  if (!agents || agents.length === 0) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  // Show the most recent reasoning from each agent, newest first.
  const entries = agents
    .filter(a => a.reasoning)
    .reverse(); // newest first
  if (entries.length === 0) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.replaceChildren();
  entries.forEach(({ side, agentId, reasoning }) => {
    const div = document.createElement('div');
    div.style.cssText = [
      'display:flex',
      'gap:0.5rem',
      'align-items:baseline',
      'font-size:0.75rem',
      'line-height:1.4',
      'padding:0.1rem 0',
    ].join(';');
    const label = document.createElement('span');
    label.style.cssText = [
      'font-weight:700',
      'color:#a78bfa',
      'white-space:nowrap',
      'flex-shrink:0',
    ].join(';');
    label.textContent = `Side ${side}:`;
    const text = document.createElement('span');
    text.style.cssText = [
      'color:#e2e8f0',
      'word-break:break-word',
    ].join(';');
    text.textContent = reasoning;
    div.appendChild(label);
    div.appendChild(text);
    el.appendChild(div);
  });
}
