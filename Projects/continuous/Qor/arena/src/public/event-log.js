/**
 * appendEvent — prepends a formatted event line to the log element.
 * Format: [turn N] side X: move Y→Z
 * Max 200 entries; older entries are removed.
 */
export function appendEvent(logEl, event) {
  if (!logEl) return;
  const entry = document.createElement('div');
  entry.className = 'event-entry';
  const ts = event.timestamp
    ? new Date(event.timestamp).toISOString().replace('T', ' ').slice(11, 19)
    : '';
  entry.textContent = `[turn ${event.turn ?? '?'}] ${event.side ?? '?'}: ${event.move ?? '?'}`;
  if (ts) {
    const meta = document.createElement('span');
    meta.className = 'event-ts';
    meta.textContent = ts + ' ';
    entry.insertBefore(meta, entry.firstChild);
  }
  logEl.insertBefore(entry, logEl.firstChild);
  while (logEl.children.length > 200) {
    logEl.removeChild(logEl.lastChild);
  }
}
