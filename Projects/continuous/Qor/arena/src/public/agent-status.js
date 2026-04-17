/**
 * Agent status display renderer.
 * Renders each agent's side, status, invalid count, and avg decision ms.
 * @param {HTMLElement} el
 * @param {Array<{ id: string, side: string, status: string, invalidCount: number, totalMs: number, totalActions: number }>} sessions
 */
export function updateAgentStatus(el, sessions) {
  if (!el) return;
  if (!sessions || sessions.length === 0) {
    el.textContent = '';
    return;
  }
  const lines = sessions.map(s => {
    const avgMs = s.totalActions > 0 ? Math.round(s.totalMs / s.totalActions) : 0;
    return `Side ${s.side}: ${s.status} | invalid: ${s.invalidCount} | avg: ${avgMs}ms`;
  });
  el.textContent = lines.join(' | ');
}
